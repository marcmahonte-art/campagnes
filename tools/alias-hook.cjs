/*
 * Résout l'alias `@/` au runtime pour les harnais compilés en CommonJS.
 *
 * Pourquoi c'est nécessaire
 * -------------------------
 * `lib/plans.ts` importe `lib/pricing/config.ts` via `@/lib/pricing/config`.
 * `tsc` sait résoudre cet alias à la **compilation** (grâce à `paths` dans le
 * tsconfig du harnais) mais ne le **réécrit pas** dans le JavaScript émis : le
 * fichier compilé contient literally `require("@/lib/pricing/config")`, que Node
 * ne sait pas résoudre.
 *
 * Le symptôme est trompeur : avec `noEmitOnError: false`, TypeScript signalait
 * l'erreur, émettait quand même, et le harnais partait sur un module
 * incomplet — jusqu'à `MODULE_NOT_FOUND` à l'exécution, ou pire, un contrôle qui
 * passe sur du code non résolu. Un contrôle de sécurité tarifaire qui tourne à
 * moitié ne contrôle rien.
 *
 * Ce fichier se charge **avant** le harnais (`node -r`) et installe un crochet de
 * résolution. Il est volontairement minimal : un seul alias, un seul sens.
 */
const Module = require('node:module');
const path = require('node:path');

const RACINE = path.resolve(__dirname, '..');
const ALIAS = '@';

function versCheminAbsolu(spec, parent) {
  const relatif = spec.slice(ALIAS.length + 1); // « /lib/plans » -> « lib/plans »
  const candidats = [];
  if (parent && parent.filename) {
    const buildIdx = parent.filename.indexOf(`${path.sep}build${path.sep}`);
    if (buildIdx !== -1) {
      const buildDir = parent.filename.slice(0, buildIdx + `${path.sep}build`.length);
      const inBuild = path.join(buildDir, relatif);
      candidats.push(inBuild, `${inBuild}.js`, path.join(inBuild, 'index.js'));
    }
  }
  const base = path.join(RACINE, relatif);
  candidats.push(`${base}.js`, path.join(base, 'index.js'), base, `${base}.ts`, path.join(base, 'index.ts'));
  return candidats;
}

const resolutionOriginale = Module._resolveFilename;
Module._resolveFilename = function (requete, parent, ...reste) {
  if (requete.startsWith(ALIAS + '/')) {
    const candidats = versCheminAbsolu(requete, parent);
    for (const candidat of candidats) {
      try {
        return resolutionOriginale.call(this, candidat, parent, ...reste);
      } catch {
        /* on essaie le suivant */
      }
    }
  }
  return resolutionOriginale.call(this, requete, parent, ...reste);
};