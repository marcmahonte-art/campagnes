/* Enveloppe d'exécution — montage Fabric dans Node.
 *
 * `node-canvas` est présent dans `node_modules` mais **sans binaire natif** : le
 * point d'entrée Node de Fabric est inutilisable et jsdom refuse de démarrer. On
 * neutralise `canvas` et on monte un DOM minimal, avec un contexte 2D de mesure
 * déterministe (voir `canvas-2d.js`).
 *
 * Corollaire : ce harnais vérifie la **géométrie**, pas le rendu. C'est
 * exactement ce qu'on veut mesurer — une position et une taille qu'on ne peut pas
 * mesurer ne sont pas des propriétés fiables.
 */
const path = require('path');
const Module = require('module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'canvas') return path.join(__dirname, 'canvas-2d.js');
  return originalResolve.call(this, request, ...rest);
};

const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });

const { creerCanvas } = require('./canvas-2d.js');

const globals = {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLCanvasElement: dom.window.HTMLCanvasElement,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Image: dom.window.Image,
  DOMParser: dom.window.DOMParser,
  XMLSerializer: dom.window.XMLSerializer,
  devicePixelRatio: 1,
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
};

/*
 * jsdom construit ses propres `<canvas>` et appelle `canvas` pour le contexte —
 * d'où le substitut de module plus haut. Mais il faut aussi que
 * `document.createElement('canvas')` ne demande jamais de binaire natif : on
 * renvoie notre élément, qui expose déjà `getContext`.
 */
dom.window.document.createElement = ((original) =>
  function (nom, ...reste) {
    if (String(nom).toLowerCase() === 'canvas') return creerCanvas(300, 150);
    return original.call(this, nom, ...reste);
  })(dom.window.document.createElement);

for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(global, key, { value, configurable: true, writable: true });
}

require('./build/tools/text-geometry-check/check-text-geometry.js');