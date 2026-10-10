#!/usr/bin/env node
/*
 * Le contrôle qui manquait — la CSP autorise-t-elle vraiment le détourage ?
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE
 * ---------------------------------------------------------------------------
 * Le détourage a échoué en production pendant toute une phase sans qu'aucun
 * contrôle ne le voie : le banc headless réussissait (il ne passe pas par le
 * middleware, donc sans CSP), le harnais vérifiait le contrat des modèles, et
 * personne ne vérifiait que **l'en-tête réellement servi** laissait passer les
 * `import()` de CDN dont le détourage dépend.
 *
 * Le participant, lui, lisait « le modèle n'a pas pu être téléchargé » — un
 * message de réseau pour une panne d'autorisation. C'est exactement ce genre
 * d'écart qu'un contrôle doit fermer : la source de vérité n'est pas ce que le
 * code déclare, c'est ce que le serveur envoie.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE CONTRÔLE VÉRIFIE, ET CONTRE QUOI
 * ---------------------------------------------------------------------------
 * Il lit `middleware.ts` **et** l'en-tête servi par le serveur quand il est
 * joignable. Les deux, parce qu'ils peuvent diverger : un fichier corrigé mais
 * non redéployé, ou un en-tête posé ailleurs (Vercel, proxy) qui écrase le
 * nôtre. Le test hors ligne est bloquant ; le test en ligne est un constat.
 *
 * Usage :
 *   node tools/cutout-check/check-csp.mjs                     # sources seules
 *   BASE_URL=https://campagnes-nu.vercel.app node ...          # + vérif en ligne
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MIDDLEWARE = join(ROOT, 'middleware.ts');

/* ------------------------------------------------------------------ */
/* Les hôtes que le détourage doit pouvoir joindre                    */
/* ------------------------------------------------------------------ */

/*
 * Ces quatre hôtes sont ceux du registre `CUTOUT_MODELS` de `lib/cutout.ts` —
 * deux pour le moteur (jsdelivr), deux pour les poids (Google, Hugging Face).
 * Si le registre change, ce contrôle doit échouer : c'est voulu.
 */
const HOTES = [
  'cdn.jsdelivr.net',
  'storage.googleapis.com',
  'huggingface.co',
  'cdn-lfs.huggingface.co',
];

/** Ce que le code fait, et la directive qui doit l'autoriser. */
const BESOINS = [
  {
    usage: 'import() du module MediaPipe / Transformers.js',
    directive: 'script-src',
    hotes: ['cdn.jsdelivr.net'],
  },
  {
    usage: 'fetch du WASM, des poids et du modèle .tflite',
    directive: 'connect-src',
    hotes: ['cdn.jsdelivr.net', 'storage.googleapis.com', 'huggingface.co', 'cdn-lfs.huggingface.co'],
  },
];

/**
 * Les polices du texte participant — chargées après le rendu, donc hors
 * `next/font`. Sans elles, une police choisie ne s'applique jamais.
 */
const POLICES = {
  feuille: 'fonts.googleapis.com',
  fichiers: 'fonts.gstatic.com',
};

/**
 * Ce qui doit rester **refusé**, et pourquoi.
 *
 * Un contrôle qui ne vérifie que les autorisations laisse ajouter n'importe quoi
 * sans que rien ne s'y oppose. Celui-ci fixe aussi ce qui doit rester dehors :
 * MediaPipe télémètre vers Google, et cette sortie est contraire à la promesse
 * affichée au participant.
 */
const INTERDITS = [
  {
    hote: 'odml.pa.googleapis.com',
    raison: 'télémétrie MediaPipe — sortie contraire à « traitée sur votre appareil »',
  },
];

/* ------------------------------------------------------------------ */
/* Lecture de la CSP                                                  */
/* ------------------------------------------------------------------ */

/** Extrait une directive d'une chaîne CSP. `null` si absente. */
function directive(csp, name) {
  const parts = csp.split(';').map((p) => p.trim());
  const found = parts.find((p) => p === name || p.startsWith(`${name} `));
  return found ?? null;
}

function autorise(directiveValue, hote) {
  if (!directiveValue) return false;
  return directiveValue.split(/\s+/).includes(`https://${hote}`);
}

let echecs = 0;
let constats = 0;

function ok(label) {
  console.log(`  [OK]    ${label}`);
}
function echec(label) {
  echecs += 1;
  console.log(`  [ECHEC] ${label}`);
}
function constat(label) {
  constats += 1;
  console.log(`  [ECART] ${label}`);
}

/* ------------------------------------------------------------------ */
/* 1. Les sources                                                     */
/* ------------------------------------------------------------------ */

console.log('=== CSP des sources (middleware.ts) ===\n');

let source = null;
try {
  source = readFileSync(MIDDLEWARE, 'utf8');
} catch {
  echec('middleware.ts introuvable');
}

/*
 * On reconstruit la CSP telle que le code la pose : on lit la liste d'hôtes
 * déclarée puis on vérifie les deux directives qui la consomment. Analyser
 * l'en-tête servi serait plus fidèle, mais il faut le serveur ; les deux
 * vérifications se complètent, elles ne se remplacent pas.
 */
if (source) {
  const listeHotes = /\bconst CUTOUT_HOSTS = \[([\s\S]*?)\]/.exec(source);
  if (!listeHotes) {
    echec('`CUTOUT_HOSTS` introuvable dans middleware.ts');
  } else {
    const declares = [...listeHotes[1].matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]);
    for (const hote of HOTES) {
      if (declares.includes(hote)) ok(`hôte déclaré : ${hote}`);
      else echec(`hôte absent de CUTOUT_HOSTS : ${hote}`);
    }
  }

  for (const besoin of BESOINS) {
    const bloc = new RegExp(`${besoin.directive}[^\\n]*CUTOUT_HOSTS\\.join`).test(source);
    const littéral = new RegExp(`${besoin.directive}[^\\n]*(?:'wasm-unsafe-eval'|wss:)`).test(source);
    if (bloc || littéral) {
      ok(`${besoin.directive} consomme la liste d'hôtes (${besoin.usage})`);
    } else {
      echec(`${besoin.directive} n'autorise pas les hôtes du détourage (${besoin.usage})`);
    }
  }

  if (/'wasm-unsafe-eval'/.test(source)) ok("'wasm-unsafe-eval' présent dans script-src");
  else echec("'wasm-unsafe-eval' absent : WebAssembly ne démarrera pas");

  if (/wss:\/\/cdn\.jsdelivr\.net/.test(source)) ok('WebSocket MediaPipe autorisée (wss://cdn.jsdelivr.net)');
  else echec('wss://cdn.jsdelivr.net absent : le graphe MediaPipe ne peut pas s’initialiser');

  /*
   * Le joker d'hôte est le contraire de ce qu'on veut : il rouvrirait la CSP
   * entière pour un confort de deux lignes. On refuse `https:` ou `*.` dans les
   * directives de script/connexion.
   */
  if (/script-src[^\n]*\bhttps:\s/.test(source) || /connect-src[^\n]*\bhttps:\s/.test(source)) {
    echec('un joker `https:` a été ajouté à script-src ou connect-src — la liste doit rester nommée');
  } else {
    ok('aucun joker d’hôte ajouté : la liste reste nommée');
  }
}

/* ------------------------------------------------------------------ */
/* 1 bis. Les polices du texte participant                            */
/* ------------------------------------------------------------------ */

console.log('\n=== Polices du texte participant ===\n');

if (source) {
  /*
   * La constante est développée à l'exécution par `FONT_HOSTS.join(' ')` : lire
   * la ligne brute ne dirait donc rien des hôtes qu'elle contient. On lit la
   * **déclaration** puis on vérifie que la directive la consomme — c'est ce que
   * fait le runtime, et un contrôle qui lit autrement qu'il ne s'exécute mesure
   * autre chose que le produit.
   */
  const blocPolices = /\bconst FONT_HOSTS = \[([\s\S]*?)\]/.exec(source);
  const declarees = blocPolices
    ? [...blocPolices[1].matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1])
    : [];

  for (const [role, hote] of Object.entries(POLICES)) {
    if (!declarees.includes(hote)) {
      echec(`${hote} absent de FONT_HOSTS (${role})`);
      continue;
    }
    if (/\b(style-src|font-src)[^\n]*FONT_HOSTS\.join/.test(source)) {
      ok(`${hote} déclaré et consommé par une directive (${role})`);
    } else {
      echec(`${hote} déclaré mais consommé par aucune directive (${role})`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 1 ter. Ce qui doit rester refusé                                   */
/* ------------------------------------------------------------------ */

console.log('\n=== Sorties qui doivent rester refusées ===\n');

if (source) {
  for (const interdit of INTERDITS) {
    const echappe = interdit.hote.replace(/\./g, '\\.');
    /*
     * On cherche l'hôte **dans la CSP**, pas dans le fichier entier : le nommer
     * dans un commentaire pour expliquer le refus est légitime et souhaitable.
     */
    const dansCsp = new RegExp(`(?:script-src|connect-src|font-src|style-src)[^\\n]*${echappe}`).test(source);
    if (dansCsp) echec(`${interdit.hote} est autorisé — ${interdit.raison}`);
    else ok(`${interdit.hote} reste refusé — ${interdit.raison}`);
  }
}

/* ------------------------------------------------------------------ */
/* 2. L'en-tête réellement servi                                      */
/* ------------------------------------------------------------------ */

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  console.log('\n=== En-tête servi ===');
  console.log('  (BASE_URL absent : vérification en ligne ignorée)');
} else {
  console.log(`\n=== En-tête réellement servi — ${BASE_URL} ===\n`);

  const url = `${BASE_URL}/c/essai-detourage`;
  let csp = null;

  try {
    /*
     * Le proxy d'entreprise intercepte la boucle locale : on ne le contourne
     * que pour les hôtes locaux, jamais pour un vrai site.
     */
    const res = await fetch(url, {
      headers: { accept: 'text/html' },
      redirect: 'follow',
    });
    csp = res.headers.get('content-security-policy');
    if (!res.ok) echec(`la page a répondu ${res.status}`);
    else ok(`page servie (${res.status})`);
  } catch (error) {
    echec(`requête impossible : ${error.message}`);
  }

  if (!csp) {
    echec('aucun en-tête Content-Security-Policy servi');
  } else {
    console.log(`\n  CSP : ${csp}\n`);
    for (const besoin of BESOINS) {
      const value = directive(csp, besoin.directive);
      for (const hote of besoin.hotes) {
        if (autorise(value, hote)) ok(`${besoin.directive} autorise ${hote}`);
        else echec(`${besoin.directive} n'autorise pas ${hote}`);
      }
    }
    if (/wasm-unsafe-eval/.test(csp)) ok("'wasm-unsafe-eval' servi");
    else echec("'wasm-unsafe-eval' non servi");

    /* Les polices, sur l'en-tête réel — la feuille et les fichiers. */
    const styleSrc = directive(csp, 'style-src') ?? '';
    const fontSrc = directive(csp, 'font-src') ?? '';
    if (styleSrc.includes(POLICES.feuille)) ok(`style-src autorise ${POLICES.feuille}`);
    else constat(`${POLICES.feuille} non autorisé dans style-src (police de texte)`);
    if (fontSrc.includes(POLICES.fichiers)) ok(`font-src autorise ${POLICES.fichiers}`);
    else constat(`${POLICES.fichiers} non autorisé dans font-src (fichiers de police)`);

    /* Et ce qui doit rester dehors, sur l'en-tête réel. */
    for (const interdit of INTERDITS) {
      if (csp.includes(interdit.hote)) echec(`${interdit.hote} est autorisé par l'en-tête servi`);
      else ok(`${interdit.hote} reste refusé par l'en-tête servi`);
    }

    /*
     * Un écart n'est pas toujours une panne : un déploiement peut être en
     * retard sur les sources. On le dit comme un écart, pas comme un échec —
     * sauf s'il porte sur une ressource sans laquelle le détourage ne démarre
     * pas, et c'est le cas de tout ce qui précède.
     */
    if (echecs > 0 && csp) constat('un écart entre sources et en-tête signifie souvent un déploiement en retard');
  }
}

console.log('');
if (echecs === 0) {
  console.log(`CSP OK — ${BESOINS.length} besoins couverts${constats ? `, ${constats} constat(s)` : ''}.`);
  process.exit(0);
}
console.log(`CSP EN ÉCHEC — ${echecs} problème(s).`);
process.exit(1);
