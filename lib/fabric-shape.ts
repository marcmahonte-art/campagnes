import type { FabricObject } from 'fabric';
import { ratioSpec } from './ratios';
import { importFabric } from './fabric-runtime';
import { shapeSpec } from './shapes';
import type { Ratio, ShapeLayer } from './types';
import { createBrandGradient } from './fabric-text';

/**
 * Fabrique unique des objets « forme » Fabric.
 *
 * Même raison d'être que `lib/fabric-text.ts` : l'éditeur, l'aperçu participant
 * et l'export doivent dessiner **la même** forme. Un réglage ajouté ici est
 * appliqué partout, et il n'existe aucun endroit où une forme pourrait être
 * dessinée deux fois de deux façons différentes.
 *
 * Les primitives sont construites à leur taille réelle (`scaleX`/`scaleY` = 1) :
 * la géométrie vient des nombres du descripteur, jamais d'un étirement. Les
 * formes tracées, elles, portent une mise à l'échelle — mais elle est **calculée
 * depuis la boîte du descripteur**, jamais relue du canvas. Dans les deux cas la
 * boîte émise est donc `width × scaleX`, et un aller-retour éditeur → autosave →
 * reconstruction ne dérive pas.
 */

/** Rayon du branchage intérieur de l'étoile, en fraction du rayon extérieur. */
const STAR_INNER = 0.42;

/**
 * Épaisseur de contour réellement posée sur le canvas, dans le repère du ratio.
 *
 * Le descripteur stocke une **fraction du cadre** : c'est ce qui rend le trait
 * indépendant du format et de la taille de la forme.
 */
export function strokeWidthPx(strokeWidth: number, ratio: Ratio): number {
  if (strokeWidth <= 0) return 0;
  const spec = ratioSpec(ratio);
  return Math.max(1, Math.round(Math.min(spec.width, spec.height) * strokeWidth));
}

/**
 * Décale des points centrés sur zéro vers une boîte [0, w] × [0, h].
 *
 * Indispensable : Fabric place un `Polygon` par le coin haut-gauche de son
 * emprise. Sans ce décalage, `left`/`top` désigneraient un point au milieu de
 * la forme et le calque ne tomberait pas où le descripteur le dit.
 */
function boxed(
  points: Array<{ x: number; y: number }>,
  w: number,
  h: number,
): Array<{ x: number; y: number }> {
  return points.map((point) => ({ x: point.x + w / 2, y: point.y + h / 2 }));
}

function diamondPoints(w: number, h: number): Array<{ x: number; y: number }> {
  return boxed(
    [
      { x: 0, y: -h / 2 },
      { x: w / 2, y: 0 },
      { x: 0, y: h / 2 },
      { x: -w / 2, y: 0 },
    ],
    w,
    h,
  );
}

function trianglePoints(w: number, h: number): Array<{ x: number; y: number }> {
  return boxed(
    [
      { x: 0, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 },
    ],
    w,
    h,
  );
}

function starPoints(w: number, h: number): Array<{ x: number; y: number }> {
  const raw: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? 1 : STAR_INNER;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    raw.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }

  /*
   * L'emprise d'une étoile n'est pas son cercle : ses cinq branches
   * n'atteignent pas les bords du carré qui l'englobe. On l'étire donc sur sa
   * propre emprise, pour qu'elle touche exactement les quatre bords de sa
   * boîte comme les autres formes.
   *
   * Sans cela, la largeur relue du canvas serait plus petite que celle du
   * descripteur, et l'étoile rétrécirait un peu à chaque reconstruction.
   */
  const xs = raw.map((point) => point.x);
  const ys = raw.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;

  return raw.map((point) => ({
    x: ((point.x - minX) / spanX) * w,
    y: ((point.y - minY) / spanY) * h,
  }));
}

/** Propriétés communes à toutes les formes : position, teinte, contour. */
function paintOptions(layer: ShapeLayer, ratio: Ratio, interactive: boolean) {
  return {
    left: layer.x,
    top: layer.y,
    originX: 'left' as const,
    originY: 'top' as const,
    angle: layer.rotation,
    opacity: layer.opacity,
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: strokeWidthPx(layer.strokeWidth, ratio),
    /*
     * Le trait ne s'épaissit pas quand on étire la forme. Sans cela, agrandir un
     * cadre de 10 % épaissirait son liseré de 10 % — l'épaisseur deviendrait une
     * conséquence du redimensionnement au lieu d'un réglage.
     */
    strokeUniform: true,
    strokeLineJoin: 'round' as const,
    // Éditeur : la forme se sélectionne et se déplace. Participant et export :
    // elle est inerte, seul le cadre compte.
    selectable: interactive,
    evented: interactive,
    hoverCursor: interactive ? 'move' : 'default',
  };
}

export interface ShapeObjectOptions {
  interactive?: boolean;
}

/**
 * Construit l'objet Fabric d'un calque forme.
 *
 * Le cercle suit la boîte : dans un cadre non carré, c'est une ellipse. C'est
 * volontaire — l'utilisateur redimensionne librement, et une forme qui
 * refuserait de suivre l'une de ses deux poignées serait ingérable.
 */
export async function createShapeObject(
  layer: ShapeLayer,
  ratio: Ratio,
  options: ShapeObjectOptions = {},
): Promise<FabricObject> {
  const { Ellipse, Path, Polygon, Rect } = await importFabric();

  const w = Math.max(1, layer.w);
  const h = Math.max(1, layer.h);
  const paint = paintOptions(layer, ratio, options.interactive ?? false);
  if (layer.fill === 'brand-gradient') {
    paint.fill = (await createBrandGradient()) as unknown as string;
  }

  switch (layer.kind) {
    case 'circle':
      return new Ellipse({ ...paint, rx: w / 2, ry: h / 2 });

    case 'triangle':
      return new Polygon(trianglePoints(w, h), paint);

    case 'diamond':
      return new Polygon(diamondPoints(w, h), paint);

    case 'star':
      return new Polygon(starPoints(w, h), paint);

    case 'rounded': {
      const r = Math.min(w, h) * layer.radius;
      return new Rect({ ...paint, width: w, height: h, rx: r, ry: r });
    }

    case 'rect':
    case 'line':
      return new Rect({ ...paint, width: w, height: h });

    default: {
      /*
       * Forme tracée : un chemin de courbes. Fabric mesure l'emprise en lisant
       * le tracé lui-même, donc la boîte du descripteur s'obtient par mise à
       * l'échelle du chemin. Rien n'est étiré : un tracé reste vectoriel, il
       * demeure net à toute résolution.
       *
       * `width` et `scaleX` restent ainsi deux grandeurs distinctes, et
       * l'émission du descripteur — qui lit `width × scaleX` — retombe
       * exactement sur la boîte voulue, comme pour les autres formes.
       */
      const spec = shapeSpec(layer.kind);
      if (spec.kind !== 'traced') return new Rect({ ...paint, width: w, height: h });

      const path = new Path(spec.d, paint);
      path.set({
        scaleX: w / Math.max(1, path.width ?? 1),
        scaleY: h / Math.max(1, path.height ?? 1),
      });
      return path;
    }
  }
}

/** Forme Fabric : un `Rect` porte en plus un arrondi. */
type PaintedObject = FabricObject & {
  rx?: number;
  ry?: number;
  fill?: unknown;
  stroke?: unknown;
  strokeWidth?: number;
};

/**
 * Applique la teinte et le contour à une forme **déjà posée**, sans la
 * reconstruire.
 *
 * Reconstruire ferait perdre la sélection et rejouerait une animation de rendu
 * à chaque geste du curseur d'épaisseur. Seul le changement de *nature* de la
 * forme (cercle → étoile) exige un autre objet Fabric.
 */
export function applyShapePaint(object: FabricObject, layer: ShapeLayer, ratio: Ratio): void {
  const target = object as PaintedObject;

  if (layer.fill === 'brand-gradient') {
    void createBrandGradient().then((grad) => {
      target.set({ fill: grad } as never);
      target.canvas?.requestRenderAll();
    });
  } else {
    target.set({ fill: layer.fill } as never);
  }

  target.set({
    stroke: layer.stroke,
    strokeWidth: strokeWidthPx(layer.strokeWidth, ratio),
  } as never);

  // L'arrondi n'existe que sur le rectangle : on ne le pose nulle part ailleurs.
  if (layer.kind === 'rounded') {
    const side = Math.min(target.width ?? 1, target.height ?? 1);
    const r = side * layer.radius;
    target.set({ rx: r, ry: r } as never);
  }

  object.setCoords();
}
