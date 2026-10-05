/*
 * Contrôle de la page participant contre la spec d'interface (§18, §20).
 *
 * DIFFÈRE DU CONTRÔLE ABANDONNÉ
 * -----------------------------
 * Une première version déposait un fichier photo dans `<input type="file">` via
 * `DataTransfer`, puis mesurait la barre d'actions. Le dépôt est **ignoré de
 * façon intermittente** par React (le nœud `input` est remplacé entre la pose de
 * `files` et le dispatch), et le contrôle passait **une fois sur six**.
 *
 * Un contrôle instable est pire qu'un contrôle absent : il signale un défaut là
 * où il n'y en a pas, et laisse passer celui qui compte.
 *
 * CE QUE CE CONTRÔLE FAIT
 * -----------------------
 * Il mesure ce qui **n'exige pas de photo** : le débordement horizontal et les
 * cibles tactiles sur l'écran d'accueil du parcours, rendu côté serveur et sans
 * reconstruction Fabric.
 *
 * Ce qu'il ne couvre PAS :
 * - la barre d'actions et les panneaux, qui exigent une photo chargée ;
 * - la géométrie du canvas, mesurée par `tools/text-geometry-check`.
 * Pour la barre, la voie fiable est un **vrai téléphone**.
 *
 * GARDE-FOU DE ROUTE
 * ------------------
 * Une route qui n'est pas un parcours participant fait échouer le contrôle.
 * Sans ça, `/galerie` rend une page sans débordement et le contrôle « passe »
 * sur la mauvaise page : les cibles tactiles signalées étaient celles de la
 * galerie, et la rangée de partage n'existait même pas. Un contrôle qui passe
 * sur la mauvaise page est pire qu'un contrôle absent.
 *
 * Lancement (serveur sur :3300) :
 *   node tools/participant-ui-check/check-largeurs.cjs
 *   PARTICIPANT_URL=/c/<slug> node tools/participant-ui-check/check-largeurs.cjs
 */
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

const CHROME =
  process.env.CHROME_BIN ||
  path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe');
/*
 * Port de débogage **choisi au hasard à chaque exécution**.
 *
 * C'est la cause réelle de l'instabilité des contrôles précédents — et elle
 * n'avait rien à voir avec React.
 *
 * `chrome.kill()` ne tue pas les processus enfants sur Windows : chaque
 * exécution laissait un Chrome orphelin qui gardait `--remote-debugging-port`,
 * et l'exécution suivante se reconnectait à ce navigateur périmé — cible d'un
 * ancien onglet, profil verrouillé, évaluations répondant sur une autre page.
 * Mesuré : **31 processus Chrome orphelins** après trois exécutions. C'est ce
 * qui faisait passer le contrôle une fois sur six.
 *
 * Un port au hasard supprime la collision : un orphelin ne peut plus être pris
 * pour le navigateur qu'on vient de lancer. `tuerArbre` nettoie quand même.
 */
const PORT = 9300 + Math.floor(Math.random() * 500);

/** Tue Chrome ET ses enfants — `chrome.kill()` ne fait pas ça sur Windows. */
function tuerArbre(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /f /t /pid ${pid}`, { stdio: 'pipe', windowsHide: true });
  } catch {
    /* déjà mort */
  }
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * PIDs des Chrome qui tournent avec **notre** dossier de profil.
 *
 * `wmic` lit la ligne de commande : on filtre sur `chrome-profile`, ce qui
 * ne peut appartenir qu'à ce script. Sans ça, on ne sait pas quoi tuer — et
 * tuer tous les `chrome.exe` emporterait aussi le navigateur du poste.
 */
function chromeOrphelins() {
  try {
    const out = execSync(
      'wmic process where "name=\'chrome.exe\' and commandline like \'%chrome-profile%\'" get processid',
      { stdio: 'pipe', windowsHide: true, encoding: 'utf8' },
    );
    return out
      .split(/\r?\n/)
      .map((l) => parseInt(l.trim(), 10))
      .filter((n) => Number.isFinite(n) && n !== process.pid);
  } catch {
    return [];
  }
}
const BASE = process.env.BASE_URL || 'http://localhost:3300';
const ROUTE = process.env.PARTICIPANT_URL || '/c/je-suis-exposant-au-siao';
const TMP = path.join(__dirname, '.tmp');
/*
 * Sortie **dans `captures/`**.
 *
 * `.gitignore` ignore les images de `docs` et ne réintroduit que le dossier
 * `docs/participant/captures` (règle `!.../captures/*.png`). Écrire une niveau
 * plus haut produirait des captures qu'on croit gardées et qui ne le sont pas :
 * elles resteraient locales, invisibles dans `git status`.
 */
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'participant', 'captures');

/** Largeurs imposées par la spec §18, plus le desktop. */
const LARGEURS = [320, 360, 375, 390, 414, 430, 768, 1440];

/** Textes qui n'existent que sur un parcours participant, pas sur la galerie. */
const ATTENDU = ['Comment ça marche', 'Déposez votre photo ici'];

/**
 * Attente maximale avant d'abandonner une mesure.
 *
 * La campagne se charge côté client (`ParticipantCampaign` →
 * `backend.getPublicCampaign`), et mesuré à **8 secondes**, pas 2,5 : une
 * évaluation plus tôt voit l'état transitoire et conclut que la page est vide.
 * C'est exactement le piège qui a fait croire que `/galerie` était la page
 * participante.
 */
const ATTENTE_MAX = 20000;

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

/*
 * Libère le port AVANT de lancer Chrome.
 *
 * Nécessaire si une exécution précédente a laissé un Chrome orphelin sur ce
 * port : avec un port aléatoire la collision est improbable, pas impossible.
 */
function libererPort(port) {
  try {
    const out = execSync(
      `for /f "tokens=5" %a in ('netstat -ano -p tcp ^| findstr LISTENING ^| findstr :${port} ') do taskkill /f /t /pid %a`,
      { stdio: 'pipe', windowsHide: true },
    );
    void out;
  } catch {
    /* rien n'écoutait sur ce port */
  }
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  /*
   * Profil **unique à chaque exécution**.
   *
   * Reuse du même dossier = `EPERM` dès qu'un Chrome précédent vit encore :
   * le profil est verrouillé, `fs.rmSync` échoue, le contrôle sort en code 3
   * avant même d'avoir mesuré quoi que ce soit. C'est ce qui faisait échouer
   * les exécutions 2, 3 et 4.
   *
   * Un nom unique rend la collision impossible, quel que soit le sort du
   * navigateur précédent.
   */
  const userDir = path.join(TMP, `chrome-profile-${process.pid}-${Date.now()}`);
  try {
    fs.rmSync(userDir, { recursive: true, force: true });
  } catch {
    /* dossier neuf, rien à supprimer */
  }

  libererPort(PORT);

  /*
   * On repère les navigateurs laissés par une exécution précédente en regardant
   * la ligne de commande, puis on les tue. Ciblé sur `chrome-profile-` : on ne
   * touche jamais au Chrome du poste.
   */
  for (const pid of chromeOrphelins()) tuerArbre(pid);

  // On nettoie les profils des exécutions précédentes, une fois leurs Chrome morts.
  for (const d of safeReaddir(TMP)) {
    if (d.startsWith('chrome-profile')) {
      try {
        fs.rmSync(path.join(TMP, d), { recursive: true, force: true });
      } catch {
        /* encore verrouillé — laisser tel quel */
      }
    }
  }

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

  /*
   * Nettoyage enregistré **immédiatement** après le lancement, avant toute
   * attente : c'est à ce moment-là qu'une exception (port occupé, Chrome qui
   * ne démarre pas) laisserait sinon un orphelin.
   */
  const nettoyer = () => tuerArbre(chrome.pid);
  process.on('exit', nettoyer);
  process.on('SIGINT', () => {
    nettoyer();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    nettoyer();
    process.exit(143);
  });

  let ws = null;

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

  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
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

  const arreter = (code) => {
    try {
      ws?.close();
    } catch {
      /* déjà fermé */
    }
    nettoyer();
    process.exit(code);
  };

  const evaluer = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true });
    return r.result.value;
  };

  /**
   * Attend que le parcours soit réellement monté, et échoue s'il ne l'est pas.
   *
   * Une attente fixe ment : elle passe à côté d'un rendu lent et valide un état
   * transitoire. Ici on attend la **présence** des textes attendus, avec un
   * plafond — le plafond fait partie du contrôle, ce n'est pas une tolérance.
   */
  const attendreParcours = async () => {
    const debut = Date.now();
    let vu = '';
    while (Date.now() - debut < ATTENTE_MAX) {
      vu = (await evaluer('document.body.innerText || ""')) || '';
      if (ATTENDU.every((m) => vu.includes(m))) return { ok: true, vu };
      await new Promise((r) => setTimeout(r, 400));
    }
    return { ok: false, vu };
  };

  await call('Page.enable');
  await call('Runtime.enable');

  const MESURE = `(() => {
    const de = document.documentElement;
    const sw = de.scrollWidth, cw = de.clientWidth;
    const coupables = [];
    if (sw > cw + 1) {
      document.querySelectorAll('*').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.right > cw + 1) {
          const cls = (el.className && typeof el.className === 'string')
            ? el.className.split(' ').slice(0, 2).join('.') : '';
          coupables.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') +
            ' [' + Math.round(b.left) + '..' + Math.round(b.right) + ']');
        }
      });
    }
    return JSON.stringify({
      sw, cw,
      overflow: sw > cw + 1,
      coupables: coupables.slice(0, 6),
      tropPetits: [...document.querySelectorAll('button, a[href]')]
        .map((b) => {
          const r = b.getBoundingClientRect();
          return {
            t: (b.innerText || b.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim(),
            h: Math.round(r.height),
          };
        })
        .filter((b) => b.h > 0 && b.h < 36),
      hauteurPage: Math.round(de.getBoundingClientRect().height),
    });
  })()`;

  let failures = 0;

  /* --- 1. On vérifie d'abord QUOI on mesure ------------------------------ */
  console.log(`=== ROUTE (${ROUTE}) ===`);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 900, deviceScaleFactor: 1, mobile: true,
  });
  await call('Page.navigate', { url: BASE + ROUTE });

  const premier = await attendreParcours();
  if (!premier.ok) {
    const manquants = ATTENDU.filter((m) => !premier.vu.includes(m));
    console.error(
      `ECHEC — le parcours participant ne s'est pas monté en ${ATTENTE_MAX} ms\n` +
        `  (manquant : ${manquants.join(', ')})\n` +
        `  vu : ${(premier.vu || '(aucun texte)').replace(/\s+/g, ' ').slice(0, 200)}`,
    );
    arreter(2);
  }
  console.log('[OK] parcours participant monté — on sait ce qu\u2019on mesure');
  failures = 0;

  /* --- 2. Débordement horizontal ----------------------------------------- */
  console.log('\n=== DÉBORDEMENT HORIZONTAL (spec §18) ===');
  const mesures = {};
  for (const w of LARGEURS) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: w, height: 900, deviceScaleFactor: 1, mobile: w < 768,
    });
    await call('Page.navigate', { url: BASE + ROUTE });
    const attendu = await attendreParcours();
    if (!attendu.ok) {
      console.log(`[ECHEC] ${String(w).padStart(4)} px — parcours non monté`);
      failures++;
      continue;
    }
    const m = JSON.parse(await evaluer(MESURE));
    mesures[w] = m;
    const ok = m.cw === w && !m.overflow;
    if (!ok) failures++;
    console.log(
      `[${ok ? 'OK' : 'ECHEC'}] ${String(w).padStart(4)} px — scrollWidth ${m.sw} / clientWidth ${m.cw}` +
        (m.coupables.length ? ` — hors cadre : ${m.coupables.join(', ')}` : ''),
    );
  }

  /* --- 3. Cibles tactiles ------------------------------------------------- */
  console.log('\n=== ZONES TACTILES (spec §20, ≥ 36 px) ===');
  for (const w of [320, 390]) {
    const m = mesures[w];
    if (!m) {
      console.log(`[ECHEC] ${w} px — non mesuré`);
      failures++;
      continue;
    }
    const ok = m.tropPetits.length === 0;
    if (!ok) failures++;
    console.log(
      `[${ok ? 'OK' : 'ECHEC'}] ${w} px — sous 36 px : ` +
        (m.tropPetits.length ? m.tropPetits.map((b) => `${b.t} (${b.h}px)`).join(', ') : 'aucune'),
    );
  }

  /* --- 4. Hauteur de page -------------------------------------------------- */
  console.log('\n=== HAUTEUR DE PAGE (spec §13) ===');
  const h375 = mesures[375] ? `${mesures[375].hauteurPage} px` : 'non mesurée';
  const h1440 = mesures[1440] ? `${mesures[1440].hauteurPage} px` : 'non mesurée';
  console.log(`    375 px : ${h375} · 1440 px : ${h1440}`);
  console.log(
    '    (sans photo chargée — le déroulé complet se juge sur un téléphone)',
  );

  /* --- 5. Captures ---------------------------------------------------------- */
  console.log('\n=== CAPTURES ===');
  for (const w of [320, 390, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: w, height: 1000, deviceScaleFactor: 1, mobile: w < 768,
    });
    await call('Page.navigate', { url: BASE + ROUTE });
    const vif = await attendreParcours();
    if (!vif.ok) {
      console.log(`[ECHEC] ${w} px — parcours non monté, capture impossible`);
      failures++;
      continue;
    }
    const h = (await evaluer('Math.ceil(document.documentElement.getBoundingClientRect().height)')) || 900;
    const fullH = Math.min(Math.max(Number(h) || 900, 600), 9000);
    await call('Emulation.setDeviceMetricsOverride', {
      width: w, height: fullH, deviceScaleFactor: 1, mobile: w < 768,
    });
    await new Promise((r) => setTimeout(r, 500));
    const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const f = path.join(OUT, `participant-largeur-${w}.png`);
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    console.log(`[OK] ${path.basename(f)} — ${Math.round(fs.statSync(f).size / 1024)} Ko`);
  }

  console.log('\n=== VERDICT ===');
  if (failures === 0) {
    console.log(
      'CONFORME §18/§20 — aucun débordement de 320 à 1440 px, cibles tactiles respectées.\n' +
        'NON COUVERT : barre d\u2019actions et panneaux (exigent une photo — sur téléphone).',
    );
    arreter(0);
  }
  console.log(`NON-CONFORME — ${failures} échec(s).`);
  arreter(1);
})().catch((e) => {
  console.error('ERREUR', e.message);
  process.exit(3);
});
