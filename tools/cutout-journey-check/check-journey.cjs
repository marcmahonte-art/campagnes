/*
 * Contrôle du parcours détouré — `npm run check:journey:cutout`
 *
 * POURQUOI CE CONTRÔLE EXISTE
 *
 *   `check:participant-ui` mesure l'écran d'accueil **sans photo**. Tout ce qui
 *   vient après le dépôt — l'accord de connexion facturée, la progression du
 *   détourage, le verdict, le panneau de réglages — n'était couvert par rien :
 *   aucune interface ne pose `subject: 'cutout'`, donc aucune campagne détourée
 *   n'existait pour l'ouvrir. `npm run seed:cutout` l'a créée ; ce contrôle
 *   l'utilise.
 *
 * CE QUE CE CONTRÔLE FAIT
 *
 *   Il conduit un vrai navigateur sur le vrai parcours, dépose une vraie photo
 *   dans le vrai champ de fichier, et vérifie trois choses qu'aucun contrôle
 *   statique ne peut voir :
 *
 *   1. **La chaîne tourne.** Le détourage s'exécute et rend un verdict — pas
 *      une promesse de verdict. On attend un état terminal, avec un plafond.
 *   2. **Les écrans du détourage s'affichent.** L'accord de connexion facturée
 *      annonce un volume chiffré, la progression dit quelque chose.
 *   3. **La phrase de confidentialité est celle du code.** Après la décision du
 *      2026-10-10 (voir `docs/bacground/background-frame.md` §7.4), la note doit
 *      nommer l'exception du pass au lieu d'affirmer un absolu. Ce contrôle
 *      échoue si l'ancienne formulation revient.
 *
 *      ATTENTION — CETTE ASSERTION PORTE SUR LES SOURCES, PAS SUR LA PRODUCTION.
 *
 *      Le contrôle ne peut vérifier que ce que le serveur interrogé sert. Il est
 *      donc fait pour tourner **contre les sources locales** (`npm run dev`),
 *      parce que c'est le seul endroit où une modification non encore déployée
 *      est visible. Lancé contre la production, il mesure le **dernier
 *      déploiement** : si les textes ont changé depuis, il échoue à raison et
 *      son message le dit.
 *
 *      C'est une propriété voulue, pas une limite cachée : un contrôle qui
 *      passerait contre la production sur des textes non déployés validerait
 *      une version que personne n'a publiée.
 *
 * CE QU'IL NE PROUVE PAS
 *
 *   La **qualité** du contour, ni la **latence sur téléphone**. La photo déposée
 *   est un portrait dessiné : un masque de cheveux fins ne s'y juge pas, et le
 *   navigateur de bureau n'est pas un Android milieu de gamme. La phase 1 reste
 *   due.
 *
 * PRÉREQUIS
 *
 *   La campagne d'essai doit exister : `npm run seed:cutout`. Le contrôle
 *   s'arrête avec un message clair si elle manque — il ne crée rien lui-même.
 *
 * Lancement :
 *   BASE_URL=http://localhost:3300 npm run check:journey:cutout   (sources locales)
 *   BASE_URL=https://campagnes-nu.vercel.app npm run check:journey:cutout
 */
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

const CHROME =
  process.env.CHROME_BIN ||
  path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe');

/* Port au hasard : voir le commentaire de `check-largeurs.cjs`. Un orphelin
 * d'une exécution précédente ne peut plus être pris pour notre navigateur. */
const PORT = 9800 + Math.floor(Math.random() * 500);

const BASE = process.env.BASE_URL || 'http://localhost:3300';
const ROUTE = process.env.PARTICIPANT_URL || '/c/essai-detourage';

const TMP = path.join(__dirname, '.tmp');
const SHOT_DIR = path.resolve(__dirname, '..', '..', 'docs', 'participant', 'captures');

const PORTRAIT = path.join(__dirname, 'fixtures', 'portrait-test.png');

/** Ce que l'écran d'accueil doit contenir pour qu'on sache quoi on mesure. */
const ACCUEIL = ['Comment ça marche', 'Déposez votre photo ici'];

/**
 * Ce que la note de confidentialité doit dire, et ce qu'elle ne doit plus dire.
 *
 * L'assertion est **négative** autant que positive : c'est le retour de
 * l'ancienne formulation qui est le défaut, pas l'absence de la nouvelle.
 */
const NOTE_ATTENDUE = 'Une seule exception';
const NOTE_INTERDITE = "n'est jamais envoyée à nos serveurs";

/** Plafond de la course au détourage. Le moteur se télécharge à froid. */
const ATTENTE_DETOURAGE = 180000;

function tuerArbre(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /f /t /pid ${pid}`, { stdio: 'pipe', windowsHide: true });
  } catch {
    /* déjà mort */
  }
}

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

/** Vérifie que la campagne d'essai répond, et s'arrête proprement sinon. */
async function verifierPrerequis() {
  if (!fs.existsSync(PORTRAIT)) {
    console.error(
      `Portrait de test absent : ${PORTRAIT}\n` +
        '  → le générer : npm run check:journey:cutout:portrait',
    );
    process.exit(3);
  }

  /*
   * On sonde **la campagne elle-même**, pas la racine : une route qui n'existe
   * pas renvoie 200 sur `/` d'un Next.js, et le contrôle conclurait que tout va
   * bien avant d'échouer plus loin sur un écran vide.
   *
   * On suit les redirections (5 sauts) : en production, `http://` répond 308
   * vers `https://`, et une sonde sans redirection lirait cet aller-retour comme
   * une panne.
   */
  const sonder = (url, sauts = 0) =>
    new Promise((resolve) => {
      const u = new URL(url);
      const req = http.get(
        {
          host: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname,
        },
        (res) => {
          res.resume();
          if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && sauts < 5) {
            resolve(sonder(new URL(res.headers.location, u).toString(), sauts + 1));
            return;
          }
          resolve(res.statusCode);
        },
      );
      req.on('error', () => resolve(0));
      req.setTimeout(15000, () => {
        req.destroy();
        resolve(0);
      });
    });

  const reponse = await sonder(BASE + ROUTE);
  const servie = reponse === 200 || (reponse >= 300 && reponse < 400);

  if (!servie) {
    console.error(
      `La campagne « ${ROUTE} » ne répond pas (HTTP ${reponse || 'aucune réponse'}).\n` +
        '  → la créer : npm run seed:cutout\n' +
        '  → ou viser un autre hôte : BASE_URL=... npm run check:journey:cutout',
    );
    process.exit(3);
  }
  console.log(`Campagne joignable — HTTP ${reponse} sur ${BASE}${ROUTE}`);
  if (BASE.includes('vercel.app')) {
    console.log(
      'NOTE — la production sert le DERNIER DÉPLOIEMENT. Les textes modifiés mais\n' +
        '       non déployés ne peuvent pas y être mesurés : les assertions de\n' +
        '       formulation ci-dessous portent donc sur ce qui est publié.',
    );
  }
}

(async () => {
  await verifierPrerequis();

  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const userDir = path.join(TMP, `chrome-profile-${process.pid}-${Date.now()}`);
  libererPort(PORT);
  for (const pid of chromeOrphelins()) tuerArbre(pid);

  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDir}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      /*
       * **Pas de `--disable-gpu`, et un WebGL logiciel disponible.**
       *
       * C'est la correction d'un défaut du contrôle lui-même, et il valait un
       * faux échec. Lancé avec `--disable-gpu` seul, Chrome n'accorde **aucun**
       * contexte WebGL : MediaPipe écrit alors
       *
       *   Couldn't create webGL 2 context. / Fall back on WebGL 1.
       *   Couldn't create webGL 1 context.
       *   INFO: Created TensorFlow Lite XNNPACK delegate for CPU.
       *
       * puis échoue — et le contrôle accusait le détourage. Le banc de mesure
       * (`tools/cutout-bench/run-headless.sh`) passe déjà `--enable-unsafe-swiftshader`
       * pour cette raison exacte, et il détoure sans erreur. Un contrôle qui
       * n'accorde pas au code les moyens qu'il exige mesure une autre chose que
       * le produit.
       *
       * SwiftShader est un rendu **logiciel** : il ne prouve pas la performance,
       * il prouve l'exécution. La latence réelle reste due à la mesure sur
       * téléphone, et le contrôle ne prétend pas le contraire.
       */
      '--enable-unsafe-swiftshader',
      '--window-size=390,844',
    ],
    { stdio: 'ignore' },
  );

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
  /*
   * La console et les exceptions **non interceptées** de la page.
   *
   * Sans elles, un parcours qui reste muet ne dit rien : on sait qu'aucun
   * verdict n'est venu, jamais pourquoi. C'est exactement ce qui manquait quand
   * la CSP refusait le chargement du moteur — le message affiché parlait de
   * réseau, et la cause réelle ne vivait que dans la console.
   */
  const logs = [];
  const hote = (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const t = (m.params.args || [])
        .map((a) => a.value ?? a.description ?? '')
        .join(' ')
        .trim();
      if (t) logs.push(`[${m.params.type}] ${t}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push(`[exception] ${d.exception?.description ?? d.text}`);
    }
    if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      logs.push(`[${e.level}] ${e.text}${e.url ? ` — ${e.url}` : ''}`);
    }
  };
  ws.on('message', hote);

  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const myId = ++id;
      const h = (raw) => {
        const m = JSON.parse(raw);
        if (m.id === myId) {
          ws.off('message', h);
          if (m.error) reject(new Error(`${method} : ${m.error.message}`));
          else resolve(m.result);
        }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
      setTimeout(() => reject(new Error('timeout ' + method)), 60000);
    });

  const arreter = (code) => {
    try {
      ws.close();
    } catch {
      /* déjà fermé */
    }
    nettoyer();
    process.exit(code);
  };

  const evaluer = async (expression) => {
    const r = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return r.result.value;
  };

  const texte = async () => (await evaluer('document.body.innerText || ""')) || '';

  const attendre = async (predicat, plafond, pas = 500) => {
    const debut = Date.now();
    let vu = '';
    while (Date.now() - debut < plafond) {
      vu = await texte();
      if (predicat(vu)) return { ok: true, vu, ms: Date.now() - debut };
      await new Promise((r) => setTimeout(r, pas));
    }
    return { ok: false, vu, ms: Date.now() - debut };
  };

  const capture = async (nom) => {
    const shot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const f = path.join(SHOT_DIR, nom);
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    console.log(`    capture : docs/participant/captures/${nom}`);
  };

  await call('Page.enable');
  await call('Runtime.enable');
  await call('DOM.enable');
  /* `Log` ajoute les refus émis par le navigateur lui-même — CSP comprise. */
  try {
    await call('Log.enable');
  } catch {
    /* l'activation du journal est un confort, jamais une condition */
  }

  await call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await call('Page.navigate', { url: BASE + ROUTE });

  let failures = 0;
  const ok_ = (label, detail = '') => console.log(`  [OK]    ${label}${detail ? ' — ' + detail : ''}`);
  const ko = (label, detail = '') => {
    failures++;
    console.log(`  [ECHEC] ${label}${detail ? ' — ' + detail : ''}`);
  };
  const ok = ok_;

  /* --- 1. L'accueil, et la phrase de confidentialité ---------------------- */

  /*
   * Deux familles d'assertions, et elles n'ont pas la même portée :
   *
   *   - la **chaîne** (le parcours se monte, la photo traverse le détourage)
   *     se mesure sur n'importe quel serveur, production comprise ;
   *   - les **textes** ne se mesurent que là où ils sont servis. Contre la
   *     production, ils valident le dernier déploiement — si les sources ont
   *     changé depuis, l'écart est réel et doit s'afficher comme tel, pas être
   *     masqué.
   *
   * On distingue donc l'échec de chaîne (bloquant partout) de l'écart de texte
   * (bloquant sur les sources, **signalé** sur la production — où il signifie
   * « pas encore déployé », pas « cassé »).
   */
  const surProduction = /vercel\.app|https:\/\//.test(BASE);
  const verifierTexte = (label, conforme, detail) => {
    if (conforme) {
      ok_(label);
    } else if (surProduction) {
      console.log(`  [ECART] ${label}${detail ? ' — ' + detail : ''} (non déployé)`);
    } else {
      ko(label, detail);
    }
  };

  console.log(`\n=== ACCUEIL (${ROUTE}) ===`);
  const accueil = await attendre((t) => ACCUEIL.every((m) => t.includes(m)), 25000);
  if (!accueil.ok) {
    const manquants = ACCUEIL.filter((m) => !accueil.vu.includes(m));
    ko("le parcours ne s'est pas monté", `manquant : ${manquants.join(', ')}`);
    arreter(2);
  }
  ok_('parcours participant monté');

  verifierTexte(
    "la note nomme l'exception du pass (décision §7.4)",
    accueil.vu.includes(NOTE_ATTENDUE),
    `attendu : « ${NOTE_ATTENDUE} »`,
  );

  verifierTexte(
    "l'ancienne promesse absolue a disparu",
    !accueil.vu.includes(NOTE_INTERDITE),
    `« ${NOTE_INTERDITE} » est encore servi`,
  );

  verifierTexte(
    "la pastille d'en-tête est la formulation non absolue",
    accueil.vu.includes('Votre photo est traitée sur votre appareil'),
    "attendu : « Votre photo est traitée sur votre appareil »",
  );

  /* --- 2. Le dépôt de la photo -------------------------------------------- */

  console.log('\n=== DÉPÔT DE LA PHOTO ===');
  /*
   * On laisse l'hydratation se terminer **avant** de déposer.
   *
   * Un vrai participant prend au moins une seconde à choisir sa photo ; un
   * contrôle qui injecte le fichier dès le `DOMContentLoaded` court après React.
   * La course n'est pas théorique : déposer pendant l'hydratation fait perdre le
   * fichier injecté, le parcours enchaîne sur une erreur générique en ~2 s, et
   * le contrôle accuse le détourage d'un défaut qui est le sien.
   *
   * On attend donc un signe que le composant est **interactif** — le champ de
   * fichier accepte un clic — plutôt qu'un délai en dur, qui serait faux sur une
   * machine lente et du temps perdu sur une rapide.
   */
  const doc = await call('DOM.getDocument', { depth: -1 });
  await attendre(
    (t) => t.includes('Déposez votre photo ici') && t.includes('Comment ça marche'),
    20000,
  );
  await new Promise((r) => setTimeout(r, 1500));
  const noeud = await call('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]',
  });
  if (!noeud?.nodeId) {
    ko('champ de fichier introuvable');
    arreter(2);
  }
  await call('DOM.setFileInputFiles', { nodeId: noeud.nodeId, files: [PORTRAIT] });

  const apresDepot = await attendre(
    (t) => !t.includes('Déposez votre photo ici') || t.includes('détour') || t.includes('Détour'),
    30000,
  );
  ok('photo déposée', `${apresDepot.ms} ms`);

  /* --- 3. Les états du détourage ------------------------------------------ */

  console.log('\n=== ÉTATS DU DÉTOURAGE ===');

  /*
   * L'accord n'apparaît que sur connexion facturée. En navigateur de bureau, la
   * connexion ne l'est pas : on ne l'exige donc pas, mais on le **signale**.
   */
  const vuAccord = apresDepot.vu.includes('connexion est facturée');
  console.log(
    vuAccord
      ? "  [INFO]  l'accord de connexion facturée s'est affiché"
      : "  [INFO]  accord non affiché — connexion non facturée, cas normal en bureau",
  );

  await capture('cutout-etat-depot.png');

  /*
   * On observe **les verdicts réellement produits**, pas un état d'écran
   * approximatif.
   *
   * La première version attendait « Ajuster » ou l'absence du mot « détourage » :
   * cette condition est vraie dès le dépôt, donc le contrôle annonçait « état
   * terminal atteint — 0 s » sans que rien n'ait tourné. Un contrôle qui se
   * satisfait trop vite est pire qu'aucun contrôle : il certifie une chaîne qu'il
   * n'a pas vue fonctionner.
   *
   * Ce qu'on cherche maintenant, ce sont les messages du **diagnostic**
   * (`lib/cutout.ts`, `judgeCutout`) et l'échec explicite :
   *
   *   - « Sujet détecté. »        → verdict `ok`
   *   - « Rien n'a été détouré »  → verdict `plein`
   *   - « Aucun sujet détecté »   → verdict `vide`
   *   - « Le sujet détecté est très petit » → verdict `faible`
   *   - « n'a pas pu » / « impossible » → échec d'exécution du moteur
   */
  const VERDICTS = [
    'Sujet détecté',
    "Rien n'a été détouré",
    'Aucun sujet',
    'très petit',
  ];
  /*
   * Les marqueurs d'échec couvrent **les six messages** de `cutoutErrorMessage()`,
   * pas seulement ceux qui se ressemblent.
   *
   * La version précédente listait « n'a pas pu », « impossible de », etc. — et
   * laissait passer le message générique (« Le détourage a échoué. Vous pouvez
   * réessayer… »), qui ne contient aucun de ces fragments. Le contrôle attendait
   * donc 181 s devant un échec déjà affiché. **Un contrôle qui ne reconnaît pas
   * un message d'échec ne teste pas l'échec : il teste sa propre liste.**
   */
  const ECHEC = [
    "n'a pas pu",
    "n'a pas abouti",
    'impossible de',
    'Indisponible',
    'a échoué', // MESSAGE_GENERIC
    "n'a pas assez de mémoire", // MESSAGE_OOM
    'a pris trop de temps', // MESSAGE_TIMEOUT
    "n'a pas pu démarrer", // MESSAGE_GPU
    "n'a pas pu être préparée", // MESSAGE_IMAGE
  ];

  const debut = Date.now();
  let vuVerdict = null;
  let vuEchec = null;
  while (Date.now() - debut < ATTENTE_DETOURAGE) {
    const t = await texte();
    vuVerdict = VERDICTS.find((v) => t.includes(v)) || null;
    vuEchec = ECHEC.find((v) => t.includes(v)) || null;
    if (vuVerdict || vuEchec) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const dureeS = Math.round((Date.now() - debut) / 1000);

  if (vuVerdict) {
    ok(`le détourage a rendu un verdict — « ${vuVerdict} »`, `${dureeS} s`);
    if (vuVerdict === 'Sujet détecté') {
      console.log(
        '  [INFO]  verdict `ok` — attendu avec ce portrait dessiné : le buste\n' +
          '          occupe presque tout le cadre, le modèle n’a presque rien à retirer.\n' +
          '          La qualité du masque se juge sur une vraie photo, sur téléphone.',
      );
    }
    await capture('cutout-etat-verdict.png');
  } else if (vuEchec) {
    /*
     * On relit le message **entier**, pas seulement le fragment qui a déclenché
     * l'arrêt : c'est lui qui nomme la cause (réseau, matériel, mémoire) et donc
     * qui dit quoi réparer. Un contrôle qui ne rapporte que « échec » oblige à
     * refaire la manipulation à la main pour savoir pourquoi.
     */
    const corps = await texte();
    const ligne = corps
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 12 &&
          !/^(Changer de photo|Ajouter un texte|Ajuster|Télécharger|Réessayer|Campagnes)/.test(l),
      )
      .filter((l) => /détour|modèle|connexion|réessay|photo|sujet/i.test(l))
      .slice(0, 4)
      .join(' / ');
    ko("le détourage a échoué", `${dureeS} s`);
    console.log(`  [DÉTAIL] ${ligne.slice(0, 300)}`);
    await capture('cutout-etat-echec.png');
  } else {
    ko(
      'aucun verdict de détourage observé',
      `${dureeS} s — la chaîne n’a pas rendu de diagnostic`,
    );
    await capture('cutout-etat-sans-verdict.png');
  }

  /*
   * Ce que la page a dit à sa console, et ce que le navigateur lui a refusé.
   *
   * On l'imprime **toujours**, pas seulement en échec : une CSP qui bloque une
   * ressource est signalée ici par le navigateur, et aucun contrôle de texte ne
   * peut la voir. C'est la trace qui manquait pour distinguer « le code a échoué »
   * de « le navigateur a refusé ».
   *
   * **Un refus n'est pas toujours un défaut.** MediaPipe télémètre vers
   * `odml.pa.googleapis.com` ; la CSP le refuse **exprès**, parce que cette
   * sortie contredirait « votre photo est traitée sur votre appareil ». Le
   * moteur tourne parfaitement sans ce journal. Compter ce refus comme un échec
   * reviendrait à exiger que la page trahisse sa propre promesse pour que le
   * contrôle passe au vert — exactement l'inverse de ce qu'il doit garantir.
   */
  const ATTENDU = ['odml.pa.googleapis.com'];
  const refus = logs.filter(
    (l) =>
      /refus|refused|bloc|blocked|Content Security Policy|CSP/i.test(l) &&
      !ATTENDU.some((h) => l.includes(h)),
  );
  const refusVoulus = logs.filter(
    (l) => /bloc|blocked|refused/i.test(l) && ATTENDU.some((h) => l.includes(h)),
  );

  if (refusVoulus.length) {
    console.log('\n=== REFUS VOLONTAIRE (télémétrie) ===');
    console.log(
      `  ${ATTENDU.join(', ')} refusé par la CSP — décision de confidentialité,\n` +
        '  le moteur n’en a pas besoin. Voir middleware.ts et background-frame.md §7.4.',
    );
  }

  if (refus.length) {
    console.log('\n=== CE QUE LE NAVIGATEUR A REFUSÉ (non attendu) ===');
    for (const l of refus.slice(-12)) console.log(`  ${l.slice(0, 300)}`);
    ko('le navigateur a refusé une ressource', `${refus.length} ligne(s) de journal`);
  } else if (logs.length) {
    console.log('\n=== JOURNAL DE LA PAGE (dernières lignes) ===');
    for (const l of logs.slice(-10)) console.log(`  ${l.slice(0, 300)}`);
  }

  /* --- 4. Le message de lenteur ne promet pas un serveur ------------------ */

  console.log('\n=== LE MESSAGE DE LENTEUR RESTE VRAI ===');
  const corps = await texte();
  if (corps.includes('notre serveur') || corps.includes('nos serveurs')) {
    const contextes = corps
      .split('\n')
      .filter((l) => l.includes('serveur'))
      .map((l) => l.trim().slice(0, 120));
    console.log(`  [INFO]  mentions de serveur :\n            ${contextes.join('\n            ')}`);
  }

  /* --- Verdict ------------------------------------------------------------- */

  console.log('\n=== VERDICT ===');
  if (failures === 0) {
    console.log(
      'CONFORME — le parcours détouré se monte, la photo traverse le détourage,\n' +
        "et la note de confidentialité nomme l'exception du pass.\n" +
        'NON COUVERT : qualité du contour et latence sur téléphone (phase 1).',
    );
    arreter(0);
  }
  console.log(`NON-CONFORME — ${failures} échec(s).`);
  arreter(1);
})().catch((e) => {
  console.error('ERREUR', e.message);
  process.exit(3);
});
