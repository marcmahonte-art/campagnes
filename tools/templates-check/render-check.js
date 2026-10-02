/**
 * Contrôle AU NAVIGATEUR du verrou « Modèles de Cadres ».
 *
 * CE QU'ON PROUVE
 *   Sur la page /check-templates-render (qui monte `FramePanel` avec les trois
 *   formules), le bouton « Choisir un modèle… » doit être :
 *
 *     plan=free          → DÉSACTIVÉ, cadenas, message « Creator »
 *     plan=creator       → ACTIF, icône de modèle, aucun message
 *     plan=organization  → ACTIF, icône de modèle, aucun message
 *
 *   On lit les attributs réels du DOM et les interactions réelles, pas le code :
 *   un `hasFeature()` correct avec un bouton resté cliquable serait un droit
 *   décoratif, et c'est précisément le défaut qu'on cherche à exclure.
 *
 * ON VÉRIFIE AUSSI QUE LE CLIC NE PASSE PAS
 *   `disabled` est un attribut : on tente un vrai clic CDP et on exige que le
 *   gestionnaire ne soit jamais appelé. C'est la différence entre « le bouton a
 *   l'air verrouillé » et « le bouton est verrouillé ».
 *
 * Usage : node tools/templates-check/render-check.js
 */

const http = require('http');

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;
const BASE = 'http://127.0.0.1:3000';

const CASES = [
  { plan: 'free', expectDisabled: true },
  { plan: 'creator', expectDisabled: false },
  { plan: 'organization', expectDisabled: false },
];

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

/** Lit l'état réel du bouton dans une section donnée + installe un espion de clic. */
const READ_STATE = (plan) => `(() => {
  const sec = document.querySelector('[data-check-plan="${plan}"]');
  if (!sec) return { missing: true };
  const btn = Array.from(sec.querySelectorAll('button'))
    .find((b) => /Choisir un modèle/.test(b.textContent || ''));
  if (!btn) return { missing: true };

  // Espion : si le clic atteint un gestionnaire, on le saura.
  if (!window.__tplClicks) window.__tplClicks = {};
  if (!btn.__spied) {
    btn.addEventListener('click', () => {
      window.__tplClicks["${plan}"] = (window.__tplClicks["${plan}"] || 0) + 1;
    });
    btn.__spied = true;
  }

  /*
   * Le texte du PANNEAU, pas celui de la section de test.
   *
   * La page de contrôle affiche « plan=creator » en en-tête ; l'inclure ferait
   * croire que le panneau parle de la formule Creator alors que c'est le titre
   * du bac à sable. On part donc du bouton et on remonte à son conteneur.
   */
  const panel = btn.closest('.flex.flex-col') || sec;
  const txt = panel.innerText || '';
  return {
    missing: false,
    disabledProp: btn.disabled === true,
    hasDisabledAttr: btn.hasAttribute('disabled'),
    ariaDisabled: btn.getAttribute('aria-disabled'),
    title: btn.getAttribute('title') || '',
    // Cadenas présent quand verrouillé, icône modèle sinon.
    lockIcon: !!btn.querySelector('svg.lucide-lock'),
    templateIcon: !!btn.querySelector('svg.lucide-layout-template'),
    mentionsCreator: /Creator/i.test(txt),
    mentionsTarifs: !!sec.querySelector('a[href="/tarifs"]'),
    clickCount: (window.__tplClicks["${plan}"] || 0),
  };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitState(page, plan, ms) {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await page.eval(READ_STATE(plan));
      if (last && !last.missing) return last;
    } catch {
      /* la page peut ne pas être hydratée */
    }
    await sleep(400);
  }
  return last;
}

(async () => {
  await httpJson('GET', '/json/version');
  let pass = 0;
  let fail = 0;
  const check = (ok, label, detail = '') => {
    if (ok) {
      pass++;
      console.log(`  ok     ${label}${detail ? ' — ' + detail : ''}`);
    } else {
      fail++;
      console.log(`  ECHEC  ${label}${detail ? ' — ' + detail : ''}`);
    }
  };

  console.log('=== Verrou « Modèles de Cadres » — rendu réel ===\n');

  for (const c of CASES) {
    console.log(`--- plan=${c.plan} (bouton ${c.expectDisabled ? 'DÉSACTIVÉ attendu' : 'ACTIF attendu'})`);
    const tab = await newTab();
    let page;
    try {
      page = await connect(tab.webSocketDebuggerUrl);
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });

      await page.send('Page.navigate', { url: `${BASE}/check-templates-render` });
      await sleep(1800);
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });

      const st = await waitState(page, c.plan, 20000);
      if (!st || st.missing) {
        check(false, 'le panneau est rendu dans la page', 'section introuvable');
        console.log('');
        continue;
      }

      console.log(
        `    disabled=${st.disabledProp} attr=${st.hasDisabledAttr} aria=${st.ariaDisabled} ` +
          `cadenas=${st.lockIcon} modèle=${st.templateIcon}`
      );

      check(
        st.disabledProp === c.expectDisabled,
        `bouton ${c.expectDisabled ? 'désactivé' : 'actif'}`,
        `disabled=${st.disabledProp}`
      );
      check(
        st.hasDisabledAttr === c.expectDisabled,
        'attribut `disabled` cohérent',
        `présent=${st.hasDisabledAttr}`
      );
      check(
        (st.ariaDisabled === 'true') === c.expectDisabled,
        '`aria-disabled` annoncé aux lecteurs d’écran',
        `aria-disabled=${st.ariaDisabled}`
      );

      if (c.expectDisabled) {
        check(st.lockIcon, 'un cadenas remplace l’icône du module');
        check(!st.templateIcon, 'l’icône de modèle est absente');
        check(st.mentionsCreator, 'la formule requise « Creator » est annoncée');
        check(st.mentionsTarifs, 'un lien vers /tarifs est proposé');

        // --- Le clic ne doit PAS passer -------------------------------
        const box = await page.eval(`(() => {
          const sec = document.querySelector('[data-check-plan="${c.plan}"]');
          const btn = Array.from(sec.querySelectorAll('button'))
            .find((b) => /Choisir un modèle/.test(b.textContent || ''));
          const r = btn.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        })()`);
        for (const type of ['mousePressed', 'mouseReleased']) {
          await page.send('Input.dispatchMouseEvent', {
            type,
            x: box.x,
            y: box.y,
            button: 'left',
            clickCount: 1,
          });
        }
        await sleep(400);
        const after = await page.eval(READ_STATE(c.plan));
        check(
          after.clickCount === 0,
          'un vrai clic n’atteint AUCUN gestionnaire',
          `clics reçus = ${after.clickCount}`
        );
      } else {
        check(!st.lockIcon, 'aucun cadenas');
        check(st.templateIcon, 'l’icône de modèle est présente');
        check(!st.mentionsCreator, 'aucune mention de formule payante');
        check(!st.mentionsTarifs, 'aucun lien /tarifs parasite');
      }
    } catch (e) {
      fail++;
      console.log(`  ECHEC plan=${c.plan} — exception: ${e.message}`);
    } finally {
      if (page) try { page.ws.close(); } catch {}
    }
    console.log('');
  }

  console.log(`=== ${pass} réussis / ${fail} échoués ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
