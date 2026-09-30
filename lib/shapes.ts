import type { ShapeKind } from './types';

/**
 * Catalogue des formes — **seule** source de vérité.
 *
 * Le panneau, l'éditeur, le rendu participant et l'export lisent tous cette
 * liste. Ajouter une forme se fait donc ici et nulle part ailleurs : les
 * libellés, les aperçus et les capacités (arrondi, contour) descendent
 * automatiquement jusqu'à l'écran.
 *
 * L'aperçu est un chemin SVG dessiné dans une boîte 24 × 24. C'est
 * volontairement un tracé, pas une icône : le bouton montre **exactement** la
 * forme qui sera posée dans le cadre.
 */

export interface ShapeSpec {
  value: ShapeKind;
  /** Nom affiché à l'utilisateur. */
  label: string;
  /** Chemin SVG d'aperçu, dans une boîte 24 × 24, rempli par `currentColor`. */
  preview: string;
  /** Vrai si le réglage d'arrondi a un effet sur cette forme. */
  hasRadius: boolean;
}

export const SHAPES: ShapeSpec[] = [
  {
    value: 'circle',
    label: 'Cercle',
    preview: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z',
    hasRadius: false,
  },
  {
    value: 'rect',
    label: 'Rectangle',
    preview: 'M4.5 6.5h15v11h-15Z',
    hasRadius: false,
  },
  {
    value: 'rounded',
    label: 'Rectangle arrondi',
    preview: 'M7.5 6.5h9a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z',
    hasRadius: true,
  },
  {
    value: 'triangle',
    label: 'Triangle',
    preview: 'M12 4.5 20 19H4Z',
    hasRadius: false,
  },
  {
    value: 'diamond',
    label: 'Losange',
    preview: 'M12 3.5 20.5 12 12 20.5 3.5 12Z',
    hasRadius: false,
  },
  {
    value: 'star',
    label: 'Étoile',
    preview:
      'M12 3 14.23 8.93 20.56 9.22 15.61 13.17 17.29 19.28 12 15.8 6.71 19.28 8.39 13.17 3.44 9.22 9.77 8.93Z',
    hasRadius: false,
  },
  {
    value: 'line',
    label: 'Ligne',
    preview: 'M3.5 11h17v2h-17Z',
    hasRadius: false,
  },
];

export const SHAPE_VALUES: ShapeKind[] = SHAPES.map((shape) => shape.value);

export function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === 'string' && (SHAPE_VALUES as string[]).includes(value);
}

/** Repli sur `rect` : une forme inconnue reste une forme, jamais un écran vide. */
export function shapeSpec(kind: ShapeKind): ShapeSpec {
  return SHAPES.find((shape) => shape.value === kind) ?? SHAPES[1];
}

/* ------------------------------------------------------------------ */
/* Bornes partagées                                                    */
/* ------------------------------------------------------------------ */

/** Épaisseur de contour maximale, en fraction de la petite dimension du cadre. */
export const STROKE_MAX = 0.15;
/** Arrondi maximal, en fraction de la petite dimension du calque. */
export const RADIUS_MAX = 0.5;

/** Épaisseur proposée quand on active un contour sur une forme qui n'en avait pas. */
export const STROKE_DEFAULT = 0.025;
/** Couleur proposée quand on active un contour : lisible sur tous les fonds clairs. */
export const STROKE_DEFAULT_COLOR = '#111111';

/** Les quatre crans d'épaisseur du niveau simple. */
export const STROKE_STEPS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Aucun' },
  { value: 0.012, label: 'Fin' },
  { value: STROKE_DEFAULT, label: 'Moyen' },
  { value: 0.06, label: 'Épais' },
];

/** Le cran le plus proche d'une épaisseur libre — pour allumer le bon bouton. */
export function strokeStepLabel(strokeWidth: number): string {
  if (strokeWidth <= 0) return 'Aucun';
  let best = STROKE_STEPS[1];
  for (const step of STROKE_STEPS) {
    if (Math.abs(step.value - strokeWidth) < Math.abs(best.value - strokeWidth)) best = step;
  }
  return best.label;
}
