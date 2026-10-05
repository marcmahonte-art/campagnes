/* Contexte 2D déterministe pour les mesures de texte.
 *
 * ## Pourquoi un substitut
 *
 * `node-canvas` est présent dans `node_modules` mais **sans binaire natif** : le
 * point d'entrée Node de Fabric est inutilisable et jsdom refuse de démarrer. Le
 * substitut de `tools/shape-check` (qui lève une erreur) suffisait pour des
 * formes, mais pas pour du texte : Fabric mesure les glyphes via
 * `ctx.measureText()`, et sans réponse il ne peut pas calculer la largeur d'une
 * ligne. Un contrôle de géométrie de texte a donc besoin d'une mesure — mais
 * **d'une mesure stable**, pas d'une police réelle.
 *
 * ## Pourquoi une mesure simplifiée
 *
 * On ne cherche pas à mesurer Arial. On cherche à savoir si une taille
 * demandée revient après un aller-retour. La règle « largeur = 0,6 × corps ×
 * nombre de caractères » est volontairement grossière et surtout
 * **déterministe** : la même chaîne donne toujours le même nombre, sur les deux
 * cycles. C'est cette stabilité qui permet d'attribuer un échec à l'échelle
 * manquante plutôt qu'à la fonte.
 *
 * Une police réelle rendrait le contrôle plusukaiumatoso mais **non
 * reproductible** d'une machine à l'autre : un écart d'un pixel ferait échouer
 * le contrôle sans qu'aucune ligne de code soit coupable.
 *
 * `2d.js` : l'objet contexte ; `fillText` / `strokeText` ne dessinent rien — ce
 * harnais mesure, il ne rend pas.
 */

/** Largeur par caractère, en fraction du corps. Valeur fixe, assumée. */
const LARGEUR_PAR_CARACTERE = 0.6;

/** Dedans `ctx.font` est de la forme « normal normal 700 96px Inter ». */
function corpsDepuisFont(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(String(font || ''));
  return m ? Number(m[1]) : 16;
}

/** Crée un contexte 2D minimal mais suffisant pour les mesures de Fabric. */
function creerContexte2D(canvas) {
  const noop = () => undefined;

  const ctx = {
    canvas,

    // --- Mesure : la seule chose réellement vitale pour ce harnais.
    font: '16px Inter',
    measureText(texte) {
      const corps = corpsDepuisFont(this.font);
      const largeur = (String(texte).length * corps * LARGEUR_PAR_CARACTERE);
      return {
        width: largeur,
        actualBoundingBoxAscent: corps * 0.8,
        actualBoundingBoxDescent: corps * 0.2,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: largeur,
        fontBoundingBoxAscent: corps * 0.8,
        fontBoundingBoxDescent: corps * 0.2,
      };
    },

    // --- État de dessin : présent pour que Fabric n'échoue pas en changeant de
    // contexte, mais inerte. Un Proxy renvoie un no-op pour tout le reste.
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    imageSmoothingEnabled: true,
    shadowBlur: 0,
    shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };

  return new Proxy(ctx, {
    get(cible, prop) {
      if (prop in cible) return cible[prop];
      // Tout le reste : méthodes de dessin sans effet.
      return noop;
    },
  });
}

/** Élément `<canvas>` utilisable, avec la taille qu'on lui donne. */
function creerCanvas(width = 1, height = 1) {
  const canvas = {
    width,
    height,
    style: {},
    getContext: () => creerContexte2D(canvas),
    getBoundingClientRect: () => ({
      x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height,
    }),
    setAttribute() {},
    getAttribute: () => null,
    addEventListener() {},
    removeEventListener() {},
    ownerDocument: { createElement: () => creerCanvas() },
  };
  return canvas;
}

module.exports = { creerCanvas, creerContexte2D };
module.exports.default = creerCanvas;