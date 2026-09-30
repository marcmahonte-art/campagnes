/* Remplaçant de `canvas` : jsdom le croit installé, mais son binaire natif est
   absent. On ne rend jamais rien — un objet vide suffit. */
class Canvas {
  constructor() {
    throw new Error('canvas natif indisponible dans cet environnement');
  }
}
Canvas.Image = class Image {};
Canvas.Canvas = Canvas;
Canvas.createCanvas = () => new Canvas();
module.exports = Canvas;
