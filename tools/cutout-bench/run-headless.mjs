#!/usr/bin/env node
/*
 * Pilote du banc en navigateur sans interface — `node run-headless.mjs`
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE
 * ---------------------------------------------------------------------------
 * Le point 9 de la phase 1 est le seul qui reste, et il est bloquant : le chemin
 * MediaPipe est **écrit et vérifié au contrat**, mais il n'a **jamais tourné**.
 * « Conforme au contrat » n'est pas « ça marche ». Ce pilote exécute réellement
 * le détourage dans un vrai navigateur, et rapporte les mesures.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI SANS DÉPENDANCE
 * ---------------------------------------------------------------------------
 * Aucun Playwright, aucun Puppeteer : ils ne sont pas installés, et les ajouter
 * coûterait un téléchargement de navigateur entier. Node 22 expose `WebSocket`
 * en global, ce qui suffit à parler le protocole CDP directement. Le navigateur
 * est celui de la machine (Edge), lancé par `run-headless.sh`.
 *
 * Ce script **ne lance aucun processus** : le serveur et le navigateur sont
 * démarrés par le script bash. L'environnement bloque les processus imbriqués
 * (`spawnSync` → EBUSY), et cette séparation l'évite complètement.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE PILOTE PROUVE, ET CE QU'IL NE PROUVE PAS
 * ---------------------------------------------------------------------------
 * Il prouve que le chemin s'exécute : le WASM se charge, le modèle se
 * télécharge, l'inférence rend un masque, et rien ne lève. Il ne prouve **pas**
 * la qualité du masque — cela se juge à l'œil, sur une vraie photo de personne,
 * et sur un vrai téléphone. Un banc sans interface ne remplace pas un
 * téléphone ; il dit seulement si l'hypothèse « ça tourne » tient.
 */

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const IMAGE = resolve(arg('image', ''));
const MODEL = arg('model', '');
const PAGE_URL = arg('url', 'http://127.0.0.1:8788/index.html');
const CDP = arg('cdp', 'http://127.0.0.1:9222');
const TIMEOUT_MS = Number(arg('timeout', '240000'));

if (!IMAGE) {
  console.error('Usage : node run-headless.mjs --image <chemin> [--model <id>] [--url <url>] [--cdp <url>]');
  process.exit(2);
}

/* ------------------------------------------------------------------ */
/* Client CDP minimal                                                  */
/* ------------------------------------------------------------------ */

let socket = null;
let nextId = 1;
const pending = new Map();
const consoleLines = [];

function send(method, params = {}, sessionId) {
  const id = nextId++;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  socket.send(JSON.stringify(payload));
  return new Promise((ok, ko) => {
    pending.set(id, { ok, ko });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        ko(new Error(`Délai dépassé sur ${method}`));
      }
    }, TIMEOUT_MS);
  });
}

async function findPageTarget() {
  const res = await fetch(`${CDP}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('Aucune cible « page » exposée par le navigateur');
  return page;
}

/** Évalue une expression dans la page et rend sa valeur. */
async function evalJs(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      `Exception dans la page : ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
    );
  }
  return result.result?.value;
}

async function waitFor(expression, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await evalJs(expression);
      if (last) return last;
    } catch (error) {
      last = `(exception : ${error.message})`;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Délai dépassé en attendant « ${label} » (dernier état : ${last})`);
}

/* ------------------------------------------------------------------ */
/* Déroulé                                                             */
/* ------------------------------------------------------------------ */

const report = {
  image: basename(IMAGE),
  model: MODEL || '(défaut de la page)',
  url: PAGE_URL,
  ok: false,
  status: null,
  measurements: null,
  raw: null,
  console: [],
  error: null,
};

try {
  const target = await findPageTarget();
  socket = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise((ok, ko) => {
    socket.addEventListener('open', ok, { once: true });
    socket.addEventListener('error', () => ko(new Error('WebSocket CDP en échec')), { once: true });
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.id && pending.has(message.id)) {
      const { ok, ko } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) ko(new Error(`${message.error.message} (${message.error.code})`));
      else ok(message.result);
      return;
    }

    if (message.method === 'Runtime.consoleAPICalled') {
      const text = (message.params.args ?? [])
        .map((a) => a.value ?? a.description ?? '')
        .join(' ');
      consoleLines.push(`[${message.params.type}] ${text}`);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const d = message.params.exceptionDetails;
      consoleLines.push(`[exception] ${d.exception?.description ?? d.text}`);
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('DOM.enable');

  /*
   * On ne fait pas `Page.navigate` : le navigateur a été lancé directement sur
   * l'URL. On attend donc que **le banc soit prêt**, c'est-à-dire que le module
   * se soit importé et que la liste des modèles soit rendue — un simple
   * `readyState` ne dirait rien de l'import ES.
   */
  await waitFor(
    'document.readyState === "complete" && !!document.getElementById("model") && document.getElementById("model").options.length > 0',
    'le banc est chargé (liste des modèles rendue)',
    60_000,
  );

  const environment = await evalJs(`(() => {
    const facts = [...document.querySelectorAll('#env .fact, #env li, #env p')].map((n) => n.textContent.trim());
    return facts.slice(0, 8);
  })()`);
  report.environment = environment;

  if (MODEL) {
    const applied = await evalJs(`(() => {
      const select = document.getElementById('model');
      const option = [...select.options].find((o) => o.value === ${JSON.stringify(MODEL)});
      if (!option) return false;
      select.value = ${JSON.stringify(MODEL)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    if (!applied) throw new Error(`Modèle « ${MODEL} » absent de la liste du banc`);
  }

  /* Le fichier est posé sur l'input caché : c'est le seul chemin autorisé. */
  const { root } = await send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#file' });
  if (!nodeId) throw new Error('Champ de fichier introuvable dans la page');
  await send('DOM.setFileInputFiles', { files: [IMAGE], nodeId });

  await waitFor('!document.getElementById("run").disabled', 'la photo est chargée');
  report.photoStatus = await evalJs('document.getElementById("status").textContent');

  await evalJs('document.getElementById("run").click(), true');

  await waitFor(
    'document.getElementById("run").textContent.trim() === "Détourer" && document.getElementById("raw").textContent.trim() !== ""',
    'la mesure est terminée',
  );

  report.status = await evalJs('document.getElementById("status").textContent');
  report.raw = await evalJs('document.getElementById("raw").innerText');
  report.statusKind = await evalJs('document.getElementById("status").className');
  report.hasResultImage = await evalJs('!!document.querySelector("#resultbox img")');
  report.csvHeader = await evalJs(`(() => {
    const head = [...document.querySelectorAll('#table thead th')].map((t) => t.textContent.trim());
    const row = [...document.querySelectorAll('#table tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
    return { head, row };
  })()`);

  report.measurements = Object.fromEntries(
    (report.raw ?? '')
      .split('\n')
      .map((line) => line.split(' : '))
      .filter((parts) => parts.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()]),
  );

  report.ok = report.statusKind === 'ok';
} catch (error) {
  report.error = error.message;
} finally {
  report.console = consoleLines.slice(-25);
  try {
    socket?.close();
  } catch {
    /* la fermeture n'est jamais un échec */
  }
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.error ? 1 : 0);
