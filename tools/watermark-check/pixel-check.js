/**
 * Vérification PAR LES PIXELS de l'export participant.
 *
 * Le contrôle `runtime-check.js` lit le DOM : il prouve que la *bannière* est
 * affichée, pas que le *fichier* porte le badge. Or la règle commerciale porte
 * sur le fichier. Un aperçu marqué + un PNG vierge serait exactement le mensonge
 * que `lib/watermark.ts` interdit.
 *
 * Ici on n'interroge pas le DOM : on déclenche le vrai bouton d'export, on
 * intercepte le Blob produit (`URL.createObjectURL`), et on compte les pixels du
 * panneau quasi blanc du badge.
 *
 * Cas éprouvé : /c/polo-concert — cadre Pro accédé depuis la galerie, donc
 * `exportPlan = 'free'`, donc badge OBLIGATOIRE dans le fichier.
 *
 * Usage : node tools/watermark-check/pixel-check.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;
const BASE = 'http://127.0.0.1:3000';
const SLUG = 'polo-concert';

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
          } catch {
            reject(new Error(`JSON invalide: ${body.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function newTab() {
  const t = await httpJson('PUT', '/json/new?about:blank');
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
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(JSON.stringify(m.error)));
        else resolve(m.result);
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
      reject(new Error('WS: ' + (e.message || e.error?.message || 'inconnu')))
    );
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensurePhoto() {
  const dir = path.join(__dirname, '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'participant-test.png');
  if (!fs.existsSync(file)) {
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX/AAD///9BHTQRAAAADUlEQVQI12P4//8/AwAI/AL+XJ/PIAAAAABJRU5ErkJggg==';
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  }
  return file;
}

/**
 * Le badge « Créé avec Campagnes » est un panneau **quasi blanc opaque** posé en
 * bas à droite (voir `lib/watermark.ts`). On ne compte donc PAS « les pixels
 * autres » — une photo qui remplit le cadre en produit partout, et le témoin
 * devient inutile.
 *
 * On cherche ce qui est propre au badge : une forte proportion de pixels
 * **très clairs** (les trois canaux > 235) et opaques, dans le coin bas-droit.
 * Aucune photo de concert n'en produit un tel bloc ; le panneau du badge, si.
 */
const PIXEL_PROBE = `(async (dataUrl) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);

  function probe(x0, y0, w, h) {
    const d = ctx.getImageData(Math.floor(x0), Math.floor(y0), Math.floor(w), Math.floor(h)).data;
    let opaque = 0, nearWhite = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;           // transparent → hors badge
      opaque++;
      if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) nearWhite++;
    }
    return { opaque, nearWhite, ratio: opaque ? nearWhite / opaque : 0 };
  }

  const bw = Math.min(420, img.width * 0.5);
  const bh = Math.min(130, img.height * 0.16);
  // Le badge est ancré en bas à droite ; on laisse une marge pour la bordure.
  const corner = probe(img.width - bw - 10, img.height - bh - 10, bw, bh);
  const topLeft = probe(0, 0, bw, bh);          // témoin : pas de badge ici
  return { width: img.width, height: img.height, corner, topLeft };
})`;

(async () => {
  const photo = ensurePhoto();
  await httpJson('GET', '/json/version');

  const tab = await newTab();
  const page = await connect(tab.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('DOM.enable');

  await page.send('Page.navigate', { url: `${BASE}/c/${SLUG}` });

  // hydratation
  for (let i = 0; i < 40; i++) {
    const ok = await page.eval('!!document.querySelector("input[type=file]")');
    if (ok) break;
    await sleep(400);
  }

  const doc = await page.send('DOM.getDocument', { depth: -1 });
  const node = await page.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: 'input[type=file]',
  });
  await page.send('DOM.setFileInputFiles', { files: [photo], nodeId: node.nodeId });

  // attendre la zone d'export
  let ready = false;
  for (let i = 0; i < 50; i++) {
    ready = await page.eval(
      'Array.from(document.querySelectorAll("button")).some(b => /Télécharger l/.test(b.textContent||""))'
    );
    if (ready) break;
    await sleep(400);
  }
  if (!ready) {
    console.log('❌ zone d’export non rendue');
    process.exit(1);
  }

  // `downloadBlob` (lib/video-export.ts) crée un Blob puis
  // `URL.createObjectURL(blob)`. On intercepte cette fonction : on reçoit le
  // Blob RÉEL, donc les octets RÉELS du fichier exporté — meilleure preuve qu'un
  // data-URL, et indépendant du nom de fichier.
  await page.eval(`
    window.__blob = null;
    const origCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (obj) {
      try { if (obj instanceof Blob) window.__blob = obj; } catch (e) {}
      return origCreate(obj);
    };
    true;
  `);

  const clicked = await page.eval(`
    (() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find(x => /Télécharger l/.test(x.textContent || ''));
      if (!b) return false;
      b.click();
      return true;
    })()
  `);
  if (!clicked) {
    console.log('❌ bouton d’export introuvable');
    process.exit(1);
  }

  let hasBlob = false;
  for (let i = 0; i < 60; i++) {
    hasBlob = await page.eval('!!window.__blob');
    if (hasBlob) break;
    await sleep(500);
  }

  if (!hasBlob) {
    console.log('❌ aucun blob capté (l’export n’a pas abouti)');
    const err = await page.eval('document.body.innerText.slice(0, 300)');
    console.log('page :', JSON.stringify(err));
    process.exit(1);
  }

  // Convertir le Blob en data-URL DANS la page puis revenir.
  const png = await page.eval(`(async () => {
    const b = window.__blob;
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(b);
    });
  })()`);

  console.log(`PNG capté : ${Math.round(png.length / 1024)} Ko`);

  const r = await page.eval(`${PIXEL_PROBE}(${JSON.stringify(png)})`);

  console.log(`\nImage : ${r.width} × ${r.height}`);
  console.log(`\n── Coin BAS-DROITE (là où le badge est dessiné)`);
  console.log(`   pixels opaques            : ${r.corner.opaque}`);
  console.log(`   pixels quasi blancs       : ${r.corner.nearWhite}`);
  console.log(`   proportion quasi blancs   : ${(r.corner.ratio * 100).toFixed(1)} %`);
  console.log(`\n── Coin HAUT-GAUCHE (témoin, pas de badge attendu)`);
  console.log(`   pixels opaques            : ${r.topLeft.opaque}`);
  console.log(`   pixels quasi blancs       : ${r.topLeft.nearWhite}`);
  console.log(`   proportion quasi blancs   : ${(r.topLeft.ratio * 100).toFixed(1)} %`);

  // Le panneau du badge produit un bloc quasi blanc : > 10 % du coin.
  // Le témoin doit rester à zéro, sinon la mesure ne prouve rien.
  const badgePresent = r.corner.ratio > 0.1;
  const controlClean = r.topLeft.ratio < 0.01;

  console.log(`\n   badge détecté en bas à droite : ${badgePresent ? '✅ OUI' : '❌ NON'}`);
  console.log(`   témoin haut-gauche exempt     : ${controlClean ? '✅ OUI (0 %)' : '❌ contaminé'}`);

  const pass = badgePresent && controlClean;
  console.log(`\n══════════ ${pass ? 'CONFORME' : 'NON CONFORME'} ══════════`);

  // Sauvegarde du PNG pour inspection visuelle.
  const out = path.join(__dirname, '.tmp', 'export-participant.png');
  fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  console.log(`PNG écrit : ${out}`);

  page.ws.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('ÉCHEC :', e.message);
  process.exit(2);
});
