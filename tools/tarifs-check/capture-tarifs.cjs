/* Captures de /tarifs à 360 px et 1440 px + mesure de débordement horizontal.
 *
 * Un contrôle qui ne peut pas échouer ne prouve rien : la sonde est donc
 * accompagnée d'un **témoin négatif** — un `div` de 1 400 px dans la même page,
 * à la même largeur. S'il n'est pas signalé comme débordant, alors la mesure
 * des pages réelles ne prouve rien non plus : on ne sait pas distinguer « la
 * page est saine » de « la sonde est aveugle ».
 *
 * Deux pièges déjà rencontrés, d'où les vérifications :
 *
 *  1. `--window-size=360` de Chrome headless ne donne pas 360 px de largeur CSS
 *     (c'est la fenêtre, pas le viewport). D'où `Emulation.setDeviceMetricsOverride`.
 *  2. Sans `<meta name="viewport">`, `mobile: true` fait retomber la mise en page
 *     sur 980 px. D'où la vérification que le moteur applique bien la largeur
 *     demandée avant de croire la mesure.
 *
 * Lancement : node tools/tarifs-check/capture-tarifs.cjs   (serveur sur :3300)
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

const CHROME =
  process.env.CHROME_BIN ||
  path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe');
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'monétisation', 'ui', 'captures');
const TMP = path.join(__dirname, '.tmp', 'chrome-profile-captures');
const PORT = 9345;
const BASE = process.env.BASE_URL || 'http://localhost:3300';
const SUFFIXE = process.argv[2] || 'u1';

function httpJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(TMP, { recursive: true, force: true });

  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${TMP}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
    ],
    { stdio: 'ignore' },
  );

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
    chrome.kill();
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

  await call('Page.enable');
  await call('Runtime.enable');

  const PROBE = `(() => {
    const de = document.documentElement;
    const sw = de.scrollWidth, cw = de.clientWidth;
    const culprits = [];
    if (sw > cw + 1) {
      document.querySelectorAll('*').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.right > cw + 1) {
          const cls = (el.className && typeof el.className === 'string')
            ? el.className.split(' ').slice(0, 2).join('.') : '';
          culprits.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') +
            ' [' + Math.round(b.left) + '..' + Math.round(b.right) + ']');
        }
      });
    }
    return JSON.stringify({
      innerWidth: window.innerWidth,
      sw, cw,
      overflow: sw > cw + 1,
      culprits: culprits.slice(0, 8),
    });
  })()`;

  async function mesurer(width, url, waitMs) {
    await call('Emulation.setDeviceMetricsOverride', {
      width, height: 900, deviceScaleFactor: 1, mobile: width < 768,
    });
    await call('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, waitMs || 2600));
    const r = await call('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    return JSON.parse(r.result.value);
  }

  async function capturer(width, fichier) {
    await call('Emulation.setDeviceMetricsOverride', {
      width, height: width < 768 ? 1800 : 1200, deviceScaleFactor: 1, mobile: width < 768,
    });
    await call('Page.navigate', { url: BASE + '/tarifs' });
    await new Promise((r) => setTimeout(r, 2600));
    const h = await call('Runtime.evaluate', {
      expression: 'Math.ceil(document.documentElement.getBoundingClientRect().height)',
      returnByValue: true,
    });
    const fullH = Math.min(Math.max(h.result.value, 600), 12000);
    await call('Emulation.setDeviceMetricsOverride', {
      width, height: fullH, deviceScaleFactor: 1, mobile: width < 768,
    });
    await new Promise((r) => setTimeout(r, 700));
    const r = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    if (!r?.data) throw new Error('captureScreenshot vide (width=' + width + ')');
    fs.writeFileSync(fichier, Buffer.from(r.data, 'base64'));
    return fs.statSync(fichier).size;
  }

  const rapport = { pages: {} };
  for (const w of [360, 1440]) rapport.pages[w] = await mesurer(w, BASE + '/tarifs');
  console.log('MESURES:', JSON.stringify(rapport.pages));

  // Témoin négatif : viewport meta présent => le mobile respecte la largeur
  // demandée, et le contenu déborde volontairement.
  rapport.temoinNegatif = await mesurer(
    360,
    'data:text/html,' +
      encodeURIComponent(
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<style>html,body{margin:0}</style>' +
          '<div style="width:1400px;height:40px;background:red"></div>',
      ),
    1200,
  );

  rapport.tailles = {
    s360: await capturer(360, path.join(OUT, `tarifs-360-${SUFFIXE}.png`)),
    s1440: await capturer(1440, path.join(OUT, `tarifs-1440-${SUFFIXE}.png`)),
  };

  console.log(JSON.stringify(rapport, null, 2));

  const ok360 = rapport.pages['360'].cw === 360 && !rapport.pages['360'].overflow;
  const ok1440 = rapport.pages['1440'].cw === 1440 && !rapport.pages['1440'].overflow;
  const temoinOk =
    rapport.temoinNegatif.overflow === true && rapport.temoinNegatif.cw === 360;

  ws.close();
  chrome.kill();

  console.log(
    'VERDICT: ' +
      (ok360 && ok1440 && temoinOk ? 'CONFORME' : 'NON-CONFORME') +
      ` (360=${ok360 ? 'ok' : 'FAIL'}, 1440=${ok1440 ? 'ok' : 'FAIL'}, temoin=${
        temoinOk ? 'detecte' : 'AVEUGLE'
      })`,
  );
  process.exit(ok360 && ok1440 && temoinOk ? 0 : 1);
})().catch((e) => {
  console.error('ERREUR', e);
  process.exit(3);
});