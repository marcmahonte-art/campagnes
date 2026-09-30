/*
 * Enveloppe d'exécution.
 *
 * `node-canvas` est présent dans `node_modules` mais sans binaire natif
 * compilé : le point d'entrée Node de Fabric est donc inutilisable, et jsdom
 * refuse même de démarrer. On neutralise `canvas` (jamais rendu ici) et on
 * monte un DOM minimal : le build navigateur de Fabric construit alors les
 * objets et calcule leurs dimensions normalement.
 *
 * Corollaire : ce harnais ne peut pas vérifier le **rendu**, seulement la
 * géométrie. C'est précisément ce qu'on veut mesurer.
 */
const path = require('path');
const Module = require('module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'canvas') return path.join(__dirname, 'canvas-stub.js');
  return originalResolve.call(this, request, ...rest);
};

const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });

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

for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(global, key, { value, configurable: true, writable: true });
}

require('./build/tools/shape-check/check-shapes.js');
