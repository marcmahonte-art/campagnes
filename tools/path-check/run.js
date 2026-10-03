/*
 * Enveloppe d'exécution — voir `tools/shape-check/run.js` pour pourquoi le
 * `canvas` natif est neutralisé.
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

require('./build/tools/path-check/check-path.js');