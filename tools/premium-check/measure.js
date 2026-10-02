/*
 * Mesure du débordement horizontal de /premium.
 *
 * On pilote `chrome-headless-shell` par le protocole DevTools (aucune
 * dépendance npm) pour répondre à une seule question, à chaque largeur :
 *
 *     document.documentElement.scrollWidth - window.innerWidth === 0 ?
 *
 * Tant que l'écart vaut 0, la page n'a pas de barre de défilement horizontale —
 * c'est la définition mesurable de « rien ne déborde ». On relève aussi les
 * éléments les plus larges, pour savoir **qui** déborde le jour où ça arrive,
 * plutôt que de le deviner.
 *
 * Usage : node tools/premium-check/measure.js <url> <largeur> [<largeur>…]
 */
const http = require('http');

const [url, ...widths] = process.argv.slice(2);

function getJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: 9226, path }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

/** Ouvre une page, l'évalue, renvoie le résultat, ferme l'onglet. */
function evaluate(target, width, expression, waitMs = 1500) {
  return new Promise(async (resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) =>
      new Promise((res) => {
        const msgId = ++id;
        pending.set(msgId, res);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result);
        pending.delete(msg.id);
      }
    };

    ws.onerror = reject;
    ws.onopen = async () => {
      try {
        await send('Page.enable');
        await send('Runtime.enable');
        /*
         * Métriques AVANT la navigation, puis navigation, puis métriques À
         * NOUVEAU : la navigation peut réinitialiser l'override, et un override
         * perdu fait mesurer toutes les largeurs à la taille de la fenêtre
         * (constaté : `innerWidth` figé à 1280 px pour toutes les largeurs).
         * Le contrôle ci-dessous refuse de conclure si la largeur n'a pas pris.
         */
        await send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await send('Page.navigate', { url });
        await new Promise((r) => setTimeout(r, waitMs));
        await send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await new Promise((r) => setTimeout(r, 900));

        // Garde-fou : sans viewport réellement appliqué, la mesure ne veut rien dire.
        const check = await send('Runtime.evaluate', {
          expression: 'window.innerWidth',
          returnByValue: true,
        });
        const realWidth = check?.result?.value;
        if (Math.abs(realWidth - width) > 2) {
          ws.close();
          resolve({ invalid: true, requested: width, realWidth });
          return;
        }

        const result = await send('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        ws.close();
        resolve(result?.result?.value);
      } catch (e) {
        ws.close();
        reject(e);
      }
    };
  });
}

const EXPRESSION = `(() => {
  const doc = document.documentElement;
  const overflow = doc.scrollWidth - window.innerWidth;

  /*
   * On liste les éléments qui dépassent la fenêtre. On mesure leur bord droit
   * réel (getBoundingClientRect) et non leur style : un élément peut être large
   * sans dépasser s'il est rogné par un parent en overflow-hidden.
   */
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > window.innerWidth + 1 || r.left < -1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 70),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      });
    }
  }
  offenders.sort((a, b) => b.right - a.right);

  return {
    overflow,
    scrollWidth: doc.scrollWidth,
    innerWidth: window.innerWidth,
    offenders: offenders.slice(0, 5),
    titre1: (document.querySelector('h1')?.textContent || '').slice(0, 40),
    cartes: document.querySelectorAll('article').length,
    steps: document.querySelectorAll('ol li').length,
  };
})()`;

/*
 * `chrome-headless-shell` démarre SANS onglet : `/json/list` renvoie une liste
 * vide et le script concluait « aucun onglet disponible ». On en crée donc un
 * si nécessaire — sinon la mesure ne s'exécute jamais (constaté).
 */
async function pageTarget() {
  let targets = await getJson('/json/list');
  let page = targets.find((t) => t.type === 'page');
  if (!page) {
    await new Promise((resolve, reject) => {
      const r = http.request(
        { host: '127.0.0.1', port: 9226, path: '/json/new?about:blank', method: 'PUT' },
        (res) => {
          res.resume();
          res.on('end', resolve);
        },
      );
      r.on('error', reject);
      r.end();
    });
    targets = await getJson('/json/list');
    page = targets.find((t) => t.type === 'page');
  }
  return page;
}

async function main() {
  const page = await pageTarget();
  if (!page) throw new Error('aucun onglet disponible');

  let failures = 0;

  for (const w of widths) {
    const width = Number(w);
    const r = await evaluate(page, width, EXPRESSION);

    // Le viewport n'a pas pris : on le dit, plutôt que de mesurer du vide.
    if (r && r.invalid) {
      failures += 1;
      console.log(
        `\nFAIL ${width}px — viewport non appliqué (innerWidth = ${r.realWidth}). Mesure refusée.`,
      );
      continue;
    }

    /*
     * Seul un débordement POSITIF est un défaut : `scrollWidth > innerWidth`
     * crée une barre horizontale. Une valeur négative signifie simplement que la
     * page est plus étroite que la fenêtre — c'est le cas normal dès qu'une
     * barre de défilement verticale apparaît (mesuré : -15 px sur ce projet).
     * La comparer à zéro produirait trois « échecs » parfaitement faux.
     */
    const ok = r.overflow <= 0;
    if (!ok) failures += 1;

    console.log(
      `\n${ok ? 'ok  ' : 'FAIL'} ${width}px — scrollWidth ${r.scrollWidth} / innerWidth ${r.innerWidth} (débordement ${r.overflow}px)`,
    );
    console.log(`     h1: "${r.titre1}" · cartes: ${r.cartes} · étapes: ${r.steps}`);
    if (!ok && r.offenders.length) {
      console.log('     éléments qui dépassent :');
      for (const o of r.offenders) {
        console.log(`       <${o.tag}> left=${o.left} right=${o.right} w=${o.width} [${o.cls}]`);
      }
    }
  }

  console.log(
    `\n${failures === 0 ? 'AUCUN DÉBORDEMENT HORIZONTAL' : `${failures} LARGEUR(S) EN DÉBORDEMENT`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('ERREUR:', e.message);
  process.exit(2);
});
