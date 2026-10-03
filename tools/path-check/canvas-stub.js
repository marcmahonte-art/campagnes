/* Remplaçant de `canvas` : même raison que dans `shape-check`. */
class Canvas {
  constructor() {
    throw new Error('canvas natif indisponible dans cet environnement');
  }
}
Canvas.Image = class Image {};
Canvas.Canvas = Canvas;
Canvas.createCanvas = () => new Canvas();
module.exports = Canvas;