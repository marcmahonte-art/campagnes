/**
 * Vérification du header mobile, par mesure réelle.
 *
 * Ce qui est éprouvé :
 *   1. à 390 px, la barre d'écran large est MASQUÉE et les deux icônes
 *      (loupe + menu) sont VISIBLES ;
 *   2. le tiroir s'ouvre et contient les entrées demandées ;
 *   3. à 1280 px, l'inverse : barre complète visible, icônes masquées ;
 *   4. aucun débordement horizontal (window.innerWidth == largeur demandée).
 *
 * Usage : node tools/header-check/mobile-check.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;
const BASE = 'http://127.0.0.1:3000';

function httpJson(method, p) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: CDP_HOST, port: CDP_PORT, path: p, method, headers: { Host: 'localhost' } },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch {
            reject(new Error('JSON invalide: ' + b.slice(0, 200)));
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { Host: 'localhost' } });
    ws.addEventListener('open', () => resolve(new Session(ws)));
    ws.addEventListener('error', (e) =>
      reject(new Error('WS: ' + (e.message || e.error?.message || '?')))
    );
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ce que l'on lit dans la page, après hydratation. */
const PROBE = `(() => {
  const vis = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };

  const header = document.querySelector('header');
  const desktopNav = header ? header.querySelector('nav.hidden') : null;
  const mobileBox = header ? Array.from(header.children[0].children).find(
    (el) => el.tagName === 'DIV' && el.className.includes('md:hidden')
  ) : null;

  const searchBtn = header ? header.querySelector('[aria-label="Rechercher une campagne"]') : null;
  const menuBtn = header ? header.querySelector('[aria-label="Ouvrir le menu"]') : null;
  const desktopSignup = header
    ? Array.from(header.querySelectorAll('a')).find(a => /Créer ma campagne/.test(a.textContent||''))
    : null;

  return {
    innerWidth: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    desktopNavVisible: vis(desktopNav),
    mobileBoxVisible: vis(mobileBox),
    searchVisible: vis(searchBtn),
    menuVisible: vis(menuBtn),
    desktopSignupVisible: vis(desktopSignup),
  };
})()`;

const MENU_PROBE = `(() => {
  const dlg = document.querySelector('[role="dialog"]');
  if (!dlg) return { open: false };
  const txt = dlg.innerText;
  return {
    open: true,
    liens: Array.from(dlg.querySelectorAll('a')).map(a => ({ t: a.textContent.trim(), h: a.getAttribute('href') })),
    hasCreer: /Créer une campagne/.test(txt),
    hasGalerie: /Galerie/.test(txt),
    hasTarifs: /Tarifs/.test(txt),
    hasLogin: /Se connecter/.test(txt),
    hasCta: /Créer ma campagne/.test(txt),
  };
})()`;

let pass = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${label} ${detail}`); }
  else { fail++; console.log(`  ❌ ${label} ${detail}`); }
}

async function shot(page, name) {
  const r = await page.send('Page.captureScreenshot', { format: 'png' });
  const dir = path.join(__dirname, '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name);
  fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
  return f;
}

async function setViewport(page, w, h) {
  // `deviceScaleFactor: 1` — un facteur 2 sur un écran headless non-retina fait
  // IGNORER l'override : `innerWidth` retombe sur la taille de la fenêtre (1560).
  // Constaté, et c'est pourquoi `tools/premium-check/measure.js` utilise 1.
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: w < 768,
  });
}

async function goto(page, url, w, h) {
  // La métrique doit être posée AVANT la navigation, sinon la page se rend à la
  // taille par défaut du navigateur (1560 ici) et la mesure ne veut rien dire.
  await setViewport(page, w, h);
  await sleep(300);
  await page.send('Page.navigate', { url });
  await sleep(2600);
  // Next peut réinitialiser l'émulation : on la repose, puis on VÉRIFIE qu'elle a
  // prise, en réessayant si besoin. Sans cette garde, le tout premier chargement
  // mesurait 1560 px de large et deux contrôles échouaient pour rien.
  for (let i = 0; i < 5; i++) {
    await setViewport(page, w, h);
    await sleep(400);
    const got = await page.eval('window.innerWidth');
    if (Math.abs(got - w) <= 2) return;
  }
}

(async () => {
  await httpJson('GET', '/json/version');
  const tab = await newTab();
  const page = await connect(tab.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');

  for (const route of ['/', '/galerie']) {
    console.log(`\n════════ ${route} — MOBILE 390 × 844 ════════`);
    await goto(page, `${BASE}${route}`, 390, 844);

    const p = await page.eval(PROBE);
    check('largeur réellement appliquée = 390', p.innerWidth === 390, `(obtenu ${p.innerWidth})`);
    check('pas de débordement horizontal', p.docWidth <= 390, `(scrollWidth ${p.docWidth})`);
    check('barre écran large MASQUÉE', !p.desktopNavVisible);
    check('loupe VISIBLE', p.searchVisible);
    check('bouton menu VISIBLE', p.menuVisible);
    check('« Créer ma campagne » desktop masqué', !p.desktopSignupVisible);

    await shot(page, `mobile-390-${route.replace(/\//g, '_') || 'accueil'}.png`);

    // Ouvrir le menu
    await page.eval(`document.querySelector('[aria-label="Ouvrir le menu"]').click()`);
    await sleep(700);

    const m = await page.eval(MENU_PROBE);
    check('tiroir ouvert', m.open);
    if (m.open) {
      check('contient « Créer une campagne »', m.hasCreer);
      check('contient « Galerie »', m.hasGalerie);
      check('contient « Tarifs »', m.hasTarifs);
      check('contient « Se connecter »', m.hasLogin);
      check('contient « Créer ma campagne »', m.hasCta);
      console.log('   liens :', JSON.stringify(m.liens));
    }
    await shot(page, `mobile-390-menu-${route.replace(/\//g, '_') || 'accueil'}.png`);

    // Fermer
    await page.eval(`document.querySelector('[role="dialog"] button[aria-label="Fermer"]')?.click()`);
    await sleep(500);

    console.log(`\n════════ ${route} — DESKTOP 1280 × 900 ════════`);
    await goto(page, `${BASE}${route}`, 1280, 900);
    const d = await page.eval(PROBE);
    check('barre écran large VISIBLE', d.desktopNavVisible);
    check('loupe masquée', !d.searchVisible);
    check('bouton menu masqué', !d.menuVisible);
    await shot(page, `desktop-1280-${route.replace(/\//g, '_') || 'accueil'}.png`);
  }

  console.log(`\n══════════ ${pass} réussis / ${fail} échoués ══════════`);
  page.ws.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ÉCHEC :', e.message);
  process.exit(2);
});
