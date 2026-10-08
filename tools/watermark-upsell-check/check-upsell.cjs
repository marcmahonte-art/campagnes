/*
 * Contrôle de l'offre « Retirer le badge » sur le parcours participant.
 *
 * Ce que ce contrôle mesure, dans un vrai navigateur (Chrome headless + CDP) :
 *   1. la carte remplace bien l'ancien constat (« Ce visuel porte le badge… ») ;
 *   2. le clic ouvre une modale accessible (role=dialog, aria-modal, focus dedans) ;
 *   3. Échap la ferme ET rend le focus au déclencheur ;
 *   4. le clic extérieur et « Plus tard » la ferment aussi ;
 *   5. le CTA principal mène à /tarifs ;
 *   6. en 390 px, ni la carte ni la modale ne débordent horizontalement.
 *
 * TÉMOIN : avant tout clic, aucune modale ne doit exister. Sans ce témoin, un
 * contrôle qui trouve toujours une boîte de dialogue passerait même si la carte
 * ouvrait n'importe quoi.
 *
 * La photo est déposée par `DOM.setFileInputFiles`, pas par `DataTransfer` :
 * mesuré sur ce projet, le dépôt par `DataTransfer` est ignoré de façon
 * intermittente par React (le nœud `input` est remplacé entre la pose et le
 * dispatch) — voir `tools/participant-ui-check/check-largeurs.cjs`.
 *
 * Prérequis : un serveur de production local (`npx next start -p 3111`).
 *   node tools/watermark-upsell-check/check-upsell.cjs
 */
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

const CHROME =
  process.env.CHROME_BIN ||
  path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe');

/** Port de débogage au hasard : un Chrome orphelin ne peut pas être pris pour le nôtre. */
const PORT = 9300 + Math.floor(Math.random() * 500);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3111';
const ROUTE = process.env.PARTICIPANT_URL || '/c/je-suis-exposant-au-siao';
const PHOTO = path.join(__dirname, '..', '..', 'public', 'logo-campagnes.png');
const TMP = path.join(__dirname, '.tmp');
const ATTENTE_MAX = 25000;

let passed = 0;
const echecs = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`OK    ${label}`);
  } else {
    echecs.push(`${label}${detail ? ` → ${detail}` : ''}`);
    console.log(`ECHEC ${label}${detail ? ` → ${detail}` : ''}`);
  }
}

function tuerArbre(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /f /t /pid ${pid}`, { stdio: 'pipe', windowsHide: true });
  } catch {
    /* déjà mort */
  }
}

function libererPort(port) {
  try {
    execSync(
      `for /f "tokens=5" %a in ('netstat -ano -p tcp ^| findstr LISTENING ^| findstr :${port} ') do taskkill /f /t /pid %a`,
      { stdio: 'pipe', windowsHide: true },
    );
  } catch {
    /* rien n'écoutait */
  }
}

function httpJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

/** Le libellé du déclencheur, dans les deux variantes de la carte. */
const CTA = 'button[aria-haspopup="dialog"]';

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const userDir = path.join(TMP, `chrome-profile-${process.pid}-${Date.now()}`);
  libererPort(PORT);

  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDir}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
    ],
    { stdio: 'ignore' },
  );

  const nettoyer = () => tuerArbre(chrome.pid);
  process.on('exit', nettoyer);

  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await httpJson(PORT, '/json/list');
      if (targets?.length) break;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!targets?.length) {
    console.error('CDP indisponible');
    nettoyer();
    process.exit(2);
  }

  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });

  let id = 0;
  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const myId = ++id;
      const h = (raw) => {
        const m = JSON.parse(raw);
        if (m.id === myId) {
          ws.off('message', h);
          resolve(m.result);
        }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
      setTimeout(() => reject(new Error('timeout ' + method)), 30000);
    });

  const evaluer = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'évaluation en échec');
    return r.result.value;
  };

  const texte = () => evaluer('document.body.innerText || ""');

  const attendre = async (expression, ms = ATTENTE_MAX) => {
    const debut = Date.now();
    while (Date.now() - debut < ms) {
      if (await evaluer(expression)) return true;
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  };

  const cliquer = async (selector) => {
    const ok = await evaluer(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`introuvable : ${selector}`);
    await new Promise((r) => setTimeout(r, 350));
  };

  const echap = async () => {
    const base = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
    await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await new Promise((r) => setTimeout(r, 350));
  };

  const arreter = (code) => {
    try {
      ws.close();
    } catch {
      /* déjà fermé */
    }
    nettoyer();
    process.exit(code);
  };

  await call('Page.enable');
  await call('Runtime.enable');
  await call('DOM.enable');

  // 1. Le parcours se monte (attente de contenu, jamais un délai fixe).
  await call('Page.navigate', { url: `${BASE}${ROUTE}` });
  const monte = await attendre(
    'document.body.innerText.includes("Déposez votre photo ici")',
  );
  check('Le parcours participant se monte', monte);
  if (!monte) arreter(1);

  check(
    'TÉMOIN : aucune modale avant tout clic',
    (await evaluer('document.querySelectorAll(\'[role="dialog"]\').length')) === 0,
  );

  // 2. Le dépôt d'une photo fait apparaître l'offre.
  const doc = await call('DOM.getDocument', { depth: -1 });
  const noeud = await call('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]',
  });
  if (!noeud?.nodeId) {
    check('Le champ de dépôt de photo existe', false);
    arreter(1);
  }
  await call('DOM.setFileInputFiles', { nodeId: noeud.nodeId, files: [PHOTO] });

  const carte = await attendre('!!document.querySelector(\'button[aria-haspopup="dialog"]\')');
  check('La photo fait apparaître la carte Créateur', carte);
  if (!carte) arreter(1);

  const corps = await texte();
  /*
   * `innerText` rend le texte tel qu'il est **peint** : l'accroche est en
   * capitales (text-transform), donc la comparaison ignore la casse. La
   * comparer telle quelle ferait échouer le contrôle sur une carte correcte.
   */
  check(
    'La carte remplace l’ancien constat',
    !corps.includes('Ce visuel porte le badge') && /vous êtes le créateur/i.test(corps),
    corps.slice(0, 200).replace(/\n/g, ' | '),
  );
  check(
    'La carte annonce une sortie (CTA)',
    /Retirer ce badge|Distribuer sans badge/.test(corps),
  );

  // 3. Ouverture : modale accessible, focus dedans.
  await cliquer(CTA);
  check(
    'Le clic ouvre une modale (role=dialog, aria-modal)',
    await evaluer('(() => { const d = document.querySelector(\'[role="dialog"]\'); return !!d && d.getAttribute("aria-modal") === "true" && !!d.getAttribute("aria-labelledby"); })()'),
  );
  check(
    'Le titre de la modale est nommé et lisible',
    await evaluer('(() => { const d = document.querySelector(\'[role="dialog"]\'); const t = d && d.querySelector("h2"); return !!t && t.textContent.trim().length > 3; })()'),
  );
  check(
    'Le focus entre dans la modale',
    await evaluer('(() => { const d = document.querySelector(\'[role="dialog"]\'); return !!d && d.contains(document.activeElement); })()'),
  );

  // 4. Échap ferme et rend le focus au déclencheur.
  await echap();
  check(
    'Échap ferme la modale',
    (await evaluer('document.querySelectorAll(\'[role="dialog"]\').length')) === 0,
  );
  check(
    'Le focus revient sur le déclencheur',
    await evaluer('(() => { const a = document.activeElement; return !!a && a.matches(\'button[aria-haspopup="dialog"]\'); })()'),
  );

  // 5. Clic extérieur.
  await cliquer(CTA);
  await cliquer('[aria-label="Fermer la fenêtre"]');
  check(
    'Le clic extérieur ferme la modale',
    (await evaluer('document.querySelectorAll(\'[role="dialog"]\').length')) === 0,
  );

  // 6. « Plus tard ».
  await cliquer(CTA);
  const plusTard = await evaluer(`(() => {
    const b = [...document.querySelectorAll('[role="dialog"] button')]
      .find((x) => x.textContent.trim() === 'Plus tard');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  check(
    '« Plus tard » ferme la modale',
    plusTard && (await evaluer('document.querySelectorAll(\'[role="dialog"]\').length')) === 0,
  );

  // 7. Mobile : 390 px, modale ouverte, aucun débordement horizontal.
  await cliquer(CTA);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await new Promise((r) => setTimeout(r, 400));
  const largeur = await evaluer('window.innerWidth');
  const debord = await evaluer(`(() => {
    const de = document.documentElement;
    return JSON.stringify({ sw: de.scrollWidth, cw: de.clientWidth });
  })()`);
  const { sw, cw } = JSON.parse(debord);
  check('Mobile : la fenêtre est bien en 390 px', largeur === 390, `innerWidth=${largeur}`);
  check('Mobile : aucun débordement horizontal', sw <= cw + 1, `scrollWidth=${sw} clientWidth=${cw}`);
  await call('Emulation.clearDeviceMetricsOverride');
  await echap();

  // 8. Le CTA principal mène à /tarifs.
  await cliquer(CTA);
  const aller = await evaluer(`(() => {
    const b = [...document.querySelectorAll('[role="dialog"] button')]
      .find((x) => /Voir les formules/.test(x.textContent));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  const arrive = await attendre('location.pathname === "/tarifs"', 20000);
  check('« Voir les formules » mène à /tarifs', aller && arrive, await evaluer('location.pathname'));

  console.log(`\n${passed} réussi(s), ${echecs.length} échec(s)`);
  if (echecs.length) {
    console.log(echecs.map((e) => `  - ${e}`).join('\n'));
    arreter(1);
  }
  arreter(0);
})().catch((error) => {
  console.error('ÉCHEC', error && error.message);
  process.exitCode = 1;
  process.exit(1);
});
