/* U1 — zoom sur la zone critique en 360 px : cartes + bandeau distribution.
 *
 * Une capture pleine page à 360 px est illisible à l'écran (elle fait 20 000 px
 * de haut). Pour valider une mise en page mobile, il faut des gros plans sur les
 * zones qui portent l'information : le prix, le quota, le coût par participant,
 * le CTA et la mention de paiement.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

const CHROME =
  process.env.CHROME_BIN ||
  path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe');
const PORT = 9343;
const BASE = 'http://localhost:3300';
/* Sortie dans `tools/tarifs-check/.tmp/` : ces gros plans sont régénérables, pas
   des livrables. Les captures retenues vont dans `docs/monétisation/ui/captures/`. */
const OUT = path.join(__dirname, '.tmp', 'crops-360');

function httpJson(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const userDir = path.join(__dirname, '.tmp', 'chrome-profile');
  fs.rmSync(userDir, { recursive: true, force: true });

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60; i++) {
    try { targets = await httpJson(PORT, '/json/list'); if (targets?.length) break; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  let id = 0;
  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const myId = ++id;
      const h = (raw) => {
        const m = JSON.parse(raw);
        if (m.id === myId) { ws.off('message', h); resolve(m.result); }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
      setTimeout(() => reject(new Error('timeout ' + method)), 30000);
    });

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 360, height: 900, deviceScaleFactor: 2, mobile: true,
  });
  await call('Page.navigate', { url: BASE + '/tarifs' });

  /* On attend l'hydratation : sans elle, un clic ne change rien et les captures
     de la période 6 mois montreraient un état qui n'existe pas. */
  for (let i = 0; i < 100; i++) {
    const r = await call('Runtime.evaluate', {
      expression: `(() => {
        const b = document.querySelector('[role="radio"]');
        return String(document.querySelectorAll('[role="radio"]').length >= 3 &&
          b && Object.keys(b).some((k) => k.startsWith('__reactFiber')));
      })()`,
      returnByValue: true,
    });
    if (r.result.value === 'true') break;
    await new Promise((r) => setTimeout(r, 200));
  }

  async function capturer(selecteur, fichier) {
    const r = await call('Runtime.evaluate', {
      expression: `(() => {
        const el = ${selecteur};
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return JSON.stringify({ x: b.x + window.scrollX, y: b.y + window.scrollY, w: b.width, h: b.height });
      })()`,
      returnByValue: true,
    });
    if (!r.result.value) {
      console.log('[INFO] absent :', selecteur);
      return false;
    }
    const box = JSON.parse(r.result.value);
    const clip = {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.min(360 - Math.max(0, box.x), box.w),
      height: Math.min(2600, box.h),
      scale: 1,
    };
    if (clip.width <= 0 || clip.height <= 0) {
      console.log('[INFO] boîte vide :', selecteur);
      return false;
    }
    const s = await call('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    fs.writeFileSync(path.join(OUT, fichier), Buffer.from(s.data, 'base64'));
    console.log(`[OK] ${fichier} — ${Math.round(clip.width)}×${Math.round(clip.height)} (dpr 2)`);
    return true;
  }

  await capturer(`document.querySelector('[role="radiogroup"]').closest('section')`, '360-a-selecteur.png');
  await capturer(
    `[...document.querySelectorAll('div')].find((d) => d.querySelector('[data-price-total="organization"]'))`,
    '360-b-cartes.png',
  );

  /* Période 6 mois : on reclique puis on recadre. C'est l'état le plus dense. */
  await call('Runtime.evaluate', {
    expression: `(() => {
      const b = [...document.querySelectorAll('[role="radio"]')].find(
        (el) => el.textContent.replace(/\\s+/g, ' ').trim().startsWith('6 mois'));
      if (b) b.click();
      return 'ok';
    })()`,
    returnByValue: true,
  });
  await new Promise((r) => setTimeout(r, 600));
  await capturer(
    `[...document.querySelectorAll('div')].find((d) => d.querySelector('[data-price-total="organization"]'))`,
    '360-c-cartes-6-mois.png',
  );

  await capturer(`document.querySelector('details')`, '360-d-grille-repliee.png');
  await call('Runtime.evaluate', {
    expression: `(() => { const d = document.querySelector('details'); if (d) d.open = true; return 'ok'; })()`,
    returnByValue: true,
  });
  await new Promise((r) => setTimeout(r, 400));
  await capturer(`document.querySelector('details')`, '360-e-grille-ouverte.png');

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error('ERREUR', e); process.exit(3); });