/* U1 — preuve que le sélecteur de durée fonctionne RÉELLEMENT.
 *
 * On ne se contente pas de constater que les prix sont dans le HTML : le HTML
 * ne prouve pas que le bouton les change. Ce script clique sur « 6 mois » et sur
 * « 12 mois » dans un vrai navigateur, puis relit les nœuds `data-price-*`.
 *
 * Falsification : avant de croire le résultat, on vérifie que la mesure SAIT
 * détecter un sélecteur cassé — on casse le script de la page (on neutralise
 * l'effet React qui écrit les prix), on reclique, et on exige que la mesure
 * signale alors l'échec. Sans ce témoin, un contrôle qui ne réagit jamais
 * passerait aussi bien avec un bouton mort.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

const CHROME =
  process.env.CHROME_BIN ||
  path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe');
const PORT = 9337;
const BASE = 'http://localhost:3300';

function httpJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/* Les valeurs attendues viennent de la grille, pas d'une intuition. */
const ATTENDU = {
  '1m': { creator: '3 000', organization: '5 000', barré: false },
  '6m': { creator: '15 000', organization: '25 000', barré: '18 000' },
  '12m': { creator: '27 000', organization: '45 000', barré: '36 000' },
};
const BARRES_PAR_PLAN = {
  '1m': { creator: null, organization: null },
  '6m': { creator: '18 000', organization: '30 000' },
  '12m': { creator: '36 000', organization: '60 000' },
};

(async () => {
  /* Profil Chrome jetable : la sonde part d'un navigateur vierge, sinon un cache
   d'un build précédent feraitelonner des chunks disparus (ChunkLoadError) et
   la mesure échouerait pour une raison étrangère à la page testée. */
const userDir = path.join(__dirname, '.tmp', 'chrome-profile-selecteur');
  fs.rmSync(userDir, { recursive: true, force: true });

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

  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await httpJson(PORT, '/json/list');
      if (targets && targets.length) break;
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
  await call('Log.enable');

  /* Toute erreur de console est relayée : un échec d'hydratation se manifeste
     par une page qui s'affiche mais ne réagit à rien, et deviner la cause
     serait pire que la lire. */
  const journal = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      journal.push(`EXCEPTION ${d.text} ${d.exception?.description ?? ''}`.slice(0, 400));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      journal.push(`LOG ${m.params.entry.text}`.slice(0, 400));
    }
  });

  /* Lit les quatre nœuds de prix pour un plan donné. */
  const LIRE = `(() => {
    const lire = (plan) => {
      const q = (a) => document.querySelector('[data-price-' + a + '="' + plan + '"]');
      const txt = (n) => (n ? n.textContent.trim() : null);
      const vis = (n) => (n ? !n.classList.contains('hidden') && n.offsetParent !== null : false);
      const st = q('strikethrough'), sv = q('savings'), mv = q('monthly');
      const un = q('unit');
      return {
        total: txt(q('total')),
        // « / mois » : ne doit exister qu'à un mois d'engagement.
        unite: txt(un),
        uniteVisible: vis(un),
        barré: txt(st),
        barréVisible: vis(st),
        argument: txt(sv),
        argumentVisible: vis(sv),
        equivalent: txt(mv),
        equivalentVisible: vis(mv),
      };
    };
    return JSON.stringify({
      creator: lire('creator'),
      organization: lire('organization'),
      selected: (document.querySelector('[role="radio"][aria-checked="true"]') || {}).textContent || null,
    });
  })()`;

  /*
   * On attend **le sélecteur**, pas une durée devinée : un `setTimeout` fixe
   * produirait un faux « tout est null » les fois où le serveur est lent, et
   * l'écran de vérification deviendrait imprévisible.
   */
  /*
   * On attend **deux** choses, dans cet ordre :
   *
   *  1. les 3 positions du sélecteur dans le DOM — preuve du rendu serveur ;
   *  2. l'hydratation — un bouton présent mais sans écouteur ne répond à rien,
   *     et le clic resterait sans effet. React attache ses écouteurs sur la
   *     racine ; on détecte l'hydratation par la présence d'un nœud de fiber sur
   *     le bouton lui-même.
   *
   * Attendre une durée fixe donnerait un résultat aléatoire sur une machine
   * lente — et un contrôle qui passe une fois sur deux ne contrôle rien.
   */
  async function attendre(timeoutMs = 30000) {
    const debut = Date.now();
    for (;;) {
      const r = await call('Runtime.evaluate', {
        expression: `(() => {
          const radios = document.querySelectorAll('[role="radio"]').length;
          const b = document.querySelector('[role="radio"]');
          const hydrate = !!(b && Object.keys(b).some((k) => k.startsWith('__reactFiber')));
          return JSON.stringify({ radios, hydrate });
        })()`,
        returnByValue: true,
      });
      const s = JSON.parse(r.result.value);
      if (s.radios >= 3 && s.hydrate) return;
      if (Date.now() - debut > timeoutMs) {
        const t = await call('Runtime.evaluate', {
          expression:
            'document.title + " | " + document.body.innerText.slice(0, 140) + " | " + JSON.stringify(' +
            "{ radios: document.querySelectorAll('[role=\\\"radio\\\"]').length })",
          returnByValue: true,
        });
        throw new Error(
          `page non prête après ${timeoutMs} ms (${t.result.value})\n` +
            `--- console navigateur ---\n${journal.join('\n') || '(aucune erreur relevée)'}`,
        );
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async function ouvrir() {
    await call('Page.navigate', { url: BASE + '/tarifs' });
    await attendre();
  }

  async function cliquer(label) {
    const r = await call('Runtime.evaluate', {
      expression: `(() => {
        const b = [...document.querySelectorAll('[role="radio"]')].find(
          (el) => el.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(label)}),
        );
        if (!b) return 'INTROUVABLE';
        b.click();
        return 'ok';
      })()`,
      returnByValue: true,
    });
    if (r.result.value !== 'ok') throw new Error(`sélecteur « ${label} » : ${r.result.value}`);

    /* On attend que l'interface soit à jour — l'attribut aria-checked change
       avant que React n'ait appliqué les nouveaux prix. Un clic suivi d'une
       lecture trop rapide lirait l'état d'avant. */
    const debut = Date.now();
    for (;;) {
      const s = JSON.parse(
        (await call('Runtime.evaluate', {
          expression: `JSON.stringify({
            sel: (document.querySelector('[role="radio"][aria-checked="true"]') || {}).textContent || '',
            total: (document.querySelector('[data-price-total="creator"]') || {}).textContent || '',
          })`,
          returnByValue: true,
        })).result.value,
      );
      if (s.sel.replace(/\s+/g, ' ').trim().startsWith(label)) {
        // L'attribut a bougé : on laisse un tick de plus pour les prix.
        await new Promise((r) => setTimeout(r, 150));
        return;
      }
      if (Date.now() - debut > 10000) throw new Error(`« ${label} » sélectionné côté DOM, mais aria-checked ne suit pas`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async function lire() {
    const r = await call('Runtime.evaluate', { expression: LIRE, returnByValue: true });
    return JSON.parse(r.result.value);
  }

  function judge(mesure, periode) {
    const attendus = ATTENDU[periode];
    const barres = BARRES_PAR_PLAN[periode];
    const echecs = [];

    /*
     * Les milliers sont séparés par une **espace fine insécable** (U+202F) —
     * c'est le format exigé (« 3 000 FCFA », jamais « 3.000 » ni « 3000 »). Le
     * comparateur travaille donc sur une version normalisée, et un contrôle
     * séparé vérifie la présence du U+202F. Sans cette séparation, il faudrait
     * choisir entre « la mesure est exacte » et « la mesure est lisible ».
     */
    const norm = (s) => (s || '').replace(/[\u202f\u00a0]/g, ' ').trim();
    const nombres = (s) => String(s || '').replace(/[^\d]/g, '');
    const attenduNombre = (s) => String(s).replace(/[^\d]/g, '');

    for (const plan of ['creator', 'organization']) {
      const m = mesure[plan];
      if (nombres(m.total) !== attenduNombre(attendus[plan])) {
        echecs.push(`${plan}: total « ${m.total} » au lieu de « ${attendus[plan]} FCFA »`);
      }
      if (periode === '1m') {
        if (!m.uniteVisible) echecs.push(`${plan}: « / mois » absent à 1 mois — le prix affiché est mensuel`);
        if (m['barréVisible']) echecs.push(`${plan}: prix barré visible alors qu'il n'y a pas d'engagement`);
        if (m.argumentVisible) echecs.push(`${plan}: argument visible à 1 mois`);
        if (m.equivalentVisible) echecs.push(`${plan}: équivalent mensuel visible à 1 mois`);
      } else {
        /* Le total prépayé ne s'affiche JAMAIS avec « / mois » : sinon la page
           annonce « 15 000 FCFA / mois » pour une formule à 2 500 FCFA / mois. */
        if (m.uniteVisible) echecs.push(`${plan}: « ${m.unite} » affiché sur un total prépayé — montant mensuel présenté comme mensuel`);
        if (!m['barréVisible']) echecs.push(`${plan}: prix barré absent à ${periode}`);
        else if (nombres(m['barré']) !== attenduNombre(barres[plan]))
          echecs.push(`${plan}: barré « ${m['barré']} » au lieu de « ${barres[plan]} FCFA »`);
        if (!m.argumentVisible) echecs.push(`${plan}: argument « X mois offerts » absent à ${periode}`);
        if (!m.equivalentVisible) echecs.push(`${plan}: équivalent mensuel absent à ${periode}`);
        else if (!/soit .+ FCFA \/ mois/.test(norm(m.equivalent)))
          echecs.push(`${plan}: équivalent « ${m.equivalent} » mal formé`);

        // Le prix barré doit être le **prorata simple** (mensuel × mois).
        // Un prix barré « historique » passerait le test du montant, pas celui
        // de la règle : c'est ici qu'on l'attrape.
        const mensuel = plan === 'creator' ? 3000 : 5000;
        const mois = periode === '6m' ? 6 : 12;
        if (nombres(m['barré']) !== String(mensuel * mois)) {
          echecs.push(
            `${plan}: prix barré « ${m['barré']} » ≠ prorata simple (${mensuel} × ${mois})`,
          );
        }

        /* Plafond de remise : −25 % (grille §1). Au-delà, l'argument vendrait
           mal la dépense à une ONG qui doit la justifier ligne à ligne. */
        const total = Number(nombres(m.total));
        const barre = Number(nombres(m['barré']));
        if (barre > 0) {
          const remise = Math.round((1 - total / barre) * 1000) / 10;
          if (remise > 25) echecs.push(`${plan}: remise affichée de ${remise} % (> 25 %)`);
        }
      }
    }

    /* Format des nombres : espace fine insécable obligatoire (§7 du prompt). */
    for (const plan of ['creator', 'organization']) {
      const brut = mesure[plan].total || '';
      if (/\d{3}\d/.test(brut)) echecs.push(`${plan}: « ${brut} » sans séparateur de milliers`);
      if (/[\u202f]/.test(brut)) {
        /* attendu : bien */
      } else if (/\d \d{3}/.test(brut)) {
        echecs.push(`${plan}: « ${brut} » utilise une espace ordinaire, pas une espace fine insécable (U+202F)`);
      }
      if (/\d,\d{3}|\d\.\d{3}/.test(brut)) echecs.push(`${plan}: « ${brut} » au format anglo-saxon`);
    }
    return echecs;
  }

  let failures = 0;
  console.log('=== MESURE RÉELLE DU SÉLECTEUR DE DURÉE ===');
  const mesures = {};
  for (const periode of ['1m', '6m', '12m']) {
    if (periode !== '1m') await cliquer(periode === '6m' ? '6 mois' : '12 mois');
    else await ouvrir();
    const m = await lire();
    mesures[periode] = m;
    const echecs = judge(m, periode);
    if (echecs.length) failures++;
    console.log(`\n[${echecs.length ? 'ECHEC' : 'OK'}] période ${periode} (sélection : ${m.selected})`);
    console.log(`        creator     : ${JSON.stringify(m.creator)}`);
    console.log(`        organization: ${JSON.stringify(m.organization)}`);
    echecs.forEach((e) => console.log(`        -> ${e}`));
  }

  /*
   * Témoin négatif : on neutralise l'écriture des prix, on reclique sur 1 mois,
   * et on exige que la mesure signale l'échec. Si elle passe malgré tout, elle
   * ne mesure rien.
   */
  console.log('\n=== TÉMOIN NÉGATIF (sélecteur volontairement cassé) ===');
  await call('Runtime.evaluate', {
    expression: `(() => {
      window.__u1Casse = true;
      const obs = new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === 'characterData' || r.type === 'childList') {
            for (const n of document.querySelectorAll('[data-price-total]')) {
              if (!n.dataset.casse) { n.dataset.casse = '1'; n.textContent = 'CASSÉ'; }
            }
          }
        }
      });
      obs.observe(document.body, { subtree: true, characterData: true, childList: true });
      return 'observeur pose';
    })()`,
    returnByValue: true,
  });
  await cliquer('1 mois');
  const casse = await lire();
  const temoinEchoue = casse.creator.total !== ATTENDU['1m'].creator + ' FCFA';
  console.log(
    `[${temoinEchoue ? 'OK' : 'AVEUGLE'}] la mesure détecte un prix que le sélecteur ne répare pas (total = « ${casse.creator.total} »)`,
  );
  if (!temoinEchoue) failures++;

  ws.close();
  chrome.kill();

  console.log('\n=== VERDICT ===');
  if (failures === 0) {
    console.log('CONFORME — le sélecteur 1 / 6 / 12 mois affiche les bons prix, et la mesure le prouve.');
    process.exit(0);
  }
  console.log(`NON-CONFORME — ${failures} échec(s).`);
  process.exit(1);
})().catch((e) => {
  console.error('ERREUR', e);
  process.exit(3);
});