/**
 * Vérification À L'EXÉCUTION de la règle de filigrane public.
 *
 * Pourquoi un navigateur et pas un `curl` :
 *   ParticipantJourney est un composant CLIENT. Un `curl` de /c/[slug] ne
 *   contient jamais le bandeau. Pire : le bandeau vit dans le bloc de la zone
 *   d'export, rendu **seulement si une photo a été déposée**. Il faut donc
 *   hydrater, INJECTER UNE VRAIE PHOTO dans l'<input type=file>, puis lire le DOM.
 *
 * Règle éprouvée (`lib/watermark-policy.ts`) :
 *   accès 'public' (/c/:slug, partage autorisé) → badge TOUJOURS posé, même si
 *   le créateur est Pro (creator.watermark = false).
 *
 * Cas réels de la base :
 *   /c/polo-concert               → cadre Pro (watermark=false) → badge + phrase « sans lien de distribution »
 *   /c/je-suis-exposant-au-siao   → cadre Pro (watermark=false) → idem
 *   /c/aes                        → cadre Free (watermark=true) → badge SANS cette phrase
 *
 * Usage : node tools/watermark-check/runtime-check.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;
const BASE = 'http://127.0.0.1:3000';

const CASES = [
  { slug: 'polo-concert', label: 'Pro (orgtes)', expectPublicPhrase: true },
  { slug: 'je-suis-exposant-au-siao', label: 'Pro (orgtes)', expectPublicPhrase: true },
  { slug: 'aes', label: 'Free (Polo)', expectPublicPhrase: false },
];

/** Fabrique une photo de test, écrite UNE fois. */
function ensurePhoto() {
  const dir = path.join(__dirname, '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'participant-test.png');
  if (!fs.existsSync(file)) {
    // PNG 8x8 rouge, valide, sans dépendance externe.
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX/AAD///9BHTQRAAAADUlEQVQI12P4//8/AwAI/AL+XJ/PIAAAAABJRU5ErkJggg==';
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  }
  return file;
}

function httpJson(method, p) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: CDP_HOST, port: CDP_PORT, path: p, method, headers: { Host: 'localhost' } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON invalide (${p}): ${body.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/** chrome-headless-shell démarre SANS onglet : il faut en créer un. */
async function newTab() {
  const t = await httpJson('PUT', '/json/new?about:blank');
  // CDP renvoie « ws://localhost/devtools/... » SANS le port → on réinjecte.
  t.webSocketDebuggerUrl = t.webSocketDebuggerUrl.replace(
    /^ws:\/\/(localhost|127\.0\.0\.1)/,
    `ws://${CDP_HOST}:${CDP_PORT}`
  );
  return t;
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text + ' :: ' + JSON.stringify(r.exceptionDetails.exception));
    }
    return r.result.value;
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { Host: 'localhost' } });
    ws.addEventListener('open', () => resolve(new Session(ws)));
    ws.addEventListener('error', (e) =>
      reject(new Error('WS error: ' + (e.message || e.error?.message || 'inconnu')))
    );
  });
}

const READ_DOM = `(() => {
  const txt = document.body.innerText || '';
  const hasFile = !!document.querySelector('input[type=file]');
  const exportBtn = Array.from(document.querySelectorAll('button'))
    .some((b) => /Télécharger l/.test(b.textContent || ''));
  return {
    hasFileInput: hasFile,
    exportZone: exportBtn,
    hasCreatorPhrase: txt.includes('Créé avec Campagnes'),
    hasPublicPhrase: txt.includes('sans lien de distribution'),
    hasPaidLink: txt.includes('Voir ce que retire une formule payante'),
    bodyLen: txt.length,
    snippet: txt.slice(0, 600),
  };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, pred, ms) {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await page.eval(READ_DOM);
    } catch {
      await sleep(300);
      continue;
    }
    if (pred(last)) return last;
    await sleep(400);
  }
  return last;
}

/** Injecte la photo dans l'<input type=file> (CDP DOM.setFileInputFiles). */
async function injectPhoto(page, file) {
  const doc = await page.send('DOM.getDocument', { depth: -1 });
  const node = await page.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: 'input[type=file]',
  });
  if (!node.nodeId) throw new Error("input[type=file] introuvable");
  await page.send('DOM.setFileInputFiles', { files: [file], nodeId: node.nodeId });
}

(async () => {
  const photo = ensurePhoto();
  console.log(`Photo de test : ${photo}`);

  await httpJson('GET', '/json/version');
  let pass = 0;
  let fail = 0;

  for (const c of CASES) {
    // Un onglet neuf par cas : aucun état résiduel d'un cas précédent.
    const tab = await newTab();
    const page = await connect(tab.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('DOM.enable');

    await page.send('Page.navigate', { url: `${BASE}/c/${c.slug}` });
    const hydrated = await waitFor(page, (d) => d.bodyLen > 200 && d.hasFileInput, 20000);

    console.log(`\n── /c/${c.slug}  (${c.label})`);
    if (!hydrated || !hydrated.hasFileInput) {
      console.log('   ❌ page non hydratée (aucun input file)');
      fail++;
      page.ws.close();
      continue;
    }

    await injectPhoto(page, photo);

    // Attendre que la photo soit acceptée : la zone d'export doit apparaître.
    const afterPhoto = await waitFor(page, (d) => d.exportZone, 20000);
    if (!afterPhoto || !afterPhoto.exportZone) {
      console.log('   ❌ zone d’export absente après dépôt de la photo');
      console.log('   extrait :', JSON.stringify((afterPhoto || hydrated).snippet.slice(0, 200)));
      fail++;
      page.ws.close();
      continue;
    }

    const okBadge = afterPhoto.hasCreatorPhrase;
    const okPhrase = afterPhoto.hasPublicPhrase === c.expectPublicPhrase;

    console.log(`   zone d’export rendue                : true`);
    console.log(`   badge « Créé avec Campagnes »        : ${afterPhoto.hasCreatorPhrase}  (attendu true)`);
    console.log(`   phrase « sans lien de distribution » : ${afterPhoto.hasPublicPhrase}  (attendu ${c.expectPublicPhrase})`);
    console.log(`   lien formule payante                 : ${afterPhoto.hasPaidLink}  (attendu ${!c.expectPublicPhrase})`);

    if (okBadge && okPhrase) {
      pass++;
      console.log('   ✅ CONFORME');
    } else {
      fail++;
      console.log('   ❌ NON CONFORME');
    }
    page.ws.close();
  }

  console.log(`\n══════════ ${pass}/${CASES.length} cas conformes ══════════`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ÉCHEC DU SCRIPT :', e.message);
  process.exit(2);
});
