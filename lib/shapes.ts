import type { ShapeKind } from './types';

/**
 * Catalogue des formes — **seule** source de vérité.
 *
 * Le panneau, l'éditeur, le rendu participant et l'export lisent tous cette
 * liste. Ajouter une forme se fait donc ici et nulle part ailleurs : les
 * libellés, les aperçus et les capacités (arrondi, contour) descendent
 * automatiquement jusqu'à l'écran.
 *
 * Deux familles, pour une raison précise :
 *
 *   — les **primitives** sont décrites par des nombres (rayon, boîte, sommets)
 *     et dessinées par Fabric. L'aperçu est un chemin SVG dans une boîte
 *     24 × 24 : c'est volontairement un tracé, pas une icône, pour que le
 *     bouton montre **exactement** la forme qui sera posée.
 *   — les **tracées** sont décrites par un chemin de courbes. Une courbe
 *     organique ne se réduit pas à des sommets sans perdre sa douceur ; la
 *     réduire à un polygone de cent points serait un dessin déguisé en nombres.
 *     Leur aperçu porte donc sa propre emprise, celle du tracé.
 *
 * Dans les deux cas le dessin vit **ici**, dans le code : le descripteur ne
 * retient que le nom de la forme. Une forme ne pèse donc rien en base, et un
 * cadre qui en contient une se relit à l'identique côté participant.
 */

interface ShapeSpecBase {
  value: ShapeKind;
  /** Nom affiché à l'utilisateur. */
  label: string;
  /** Vrai si le réglage d'arrondi a un effet sur cette forme. */
  hasRadius: boolean;
}

/** Forme décrite par des nombres, dessinée par Fabric. */
export interface PrimitiveShapeSpec extends ShapeSpecBase {
  kind: 'primitive';
  /** Chemin SVG d'aperçu, dans une boîte 24 × 24, rempli par `currentColor`. */
  preview: string;
}

/** Forme décrite par un chemin de courbes. */
export interface TracedShapeSpec extends ShapeSpecBase {
  kind: 'traced';
  /** Le tracé, dans son propre repère. */
  d: string;
  /** Emprise du tracé (`minX minY largeur hauteur`), pour l'aperçu. */
  viewBox: string;
}

export type ShapeSpec = PrimitiveShapeSpec | TracedShapeSpec;

/** Boîte de référence des aperçus primitifs. */
export const PREVIEW_BOX = '0 0 24 24';

/** Le chemin d'aperçu, quelle que soit la famille. */
export function previewPath(spec: ShapeSpec): string {
  return spec.kind === 'primitive' ? spec.preview : spec.d;
}

/** L'emprise de l'aperçu, quelle que soit la famille. */
export function previewViewBox(spec: ShapeSpec): string {
  return spec.kind === 'primitive' ? PREVIEW_BOX : spec.viewBox;
}

/**
 * Épaisseur de contour d'un aperçu, ramenée au repère de son tracé.
 *
 * Une primitive se dessine dans une boîte 24 × 24 ; un tracé, dans la sienne,
 * qui peut faire plusieurs centaines d'unités. Sans cette conversion, le
 * liseré d'une forme évidée serait invisible sur un tracé large — la forme
 * disparaîtrait de la liste des calques.
 */
export function previewStrokeWidth(spec: ShapeSpec, units = 2): number {
  const width = Number(previewViewBox(spec).split(/\s+/)[2]);
  return Number.isFinite(width) && width > 0 ? (units / 24) * width : units;
}

export const SHAPES: ShapeSpec[] = [
  {
    value: 'circle',
    label: 'Cercle',
    kind: 'primitive',
    preview: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z',
    hasRadius: false,
  },
  {
    value: 'rect',
    label: 'Rectangle',
    kind: 'primitive',
    preview: 'M4.5 6.5h15v11h-15Z',
    hasRadius: false,
  },
  {
    value: 'rounded',
    label: 'Rectangle arrondi',
    kind: 'primitive',
    preview: 'M7.5 6.5h9a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z',
    hasRadius: true,
  },
  {
    value: 'triangle',
    label: 'Triangle',
    kind: 'primitive',
    preview: 'M12 4.5 20 19H4Z',
    hasRadius: false,
  },
  {
    value: 'diamond',
    label: 'Losange',
    kind: 'primitive',
    preview: 'M12 3.5 20.5 12 12 20.5 3.5 12Z',
    hasRadius: false,
  },
  {
    value: 'star',
    label: 'Étoile',
    kind: 'primitive',
    preview:
      'M12 3 14.23 8.93 20.56 9.22 15.61 13.17 17.29 19.28 12 15.8 6.71 19.28 8.39 13.17 3.44 9.22 9.77 8.93Z',
    hasRadius: false,
  },
  {
    value: 'line',
    label: 'Ligne',
    kind: 'primitive',
    preview: 'M3.5 11h17v2h-17Z',
    hasRadius: false,
  },

  /* ------------------------------------------------------------------ */
  /* Formes tracées                                                      */
  /* ------------------------------------------------------------------ */

  /*
   * Un carré dont un seul coin est largement arrondi. Sert de fond d'affiche,
   * de pastille ou de coin décoratif — là où un rectangle franc est trop sec
   * et un disque trop rond.
   */
  {
    value: 'round-corner',
    label: 'Coin arrondi',
    kind: 'traced',
    hasRadius: false,
    viewBox: '204.5 23.4 795 795',
    d: 'M619.9,23.4c-229.4,0-415.4,186-415.4,415.4v379.6h379.6c229.4,0,415.4-186,415.4-415.4V23.4H619.9z',
  },

  /*
   * Un galet presque carré. Le plus sage des trois blobs : ses bords sont peu
   * marqués, il se pose derrière un texte sans le concurrencer.
   */
  {
    value: 'blob',
    label: 'Blob arrondi',
    kind: 'traced',
    hasRadius: false,
    viewBox: '354.03 121.53 495.98 598.82',
    d: 'M808,642.4c-37.8,37.5-109,41.3-194.8,55.9c-85.8,14.6-186.2,40-226.1,2.5c-39.8-37.5-19-137.9-21.9-241.1c-2.8-103.3-29.2-209.3,10.6-270.8c39.9-61.5,145.9-78.5,234.2-60.7s158.7,70.4,196.6,131.9c37.8,61.5,43,131.9,43.4,202.8C850.3,533.7,845.8,604.9,808,642.4z',
  },

  /*
   * Le plus irrégulier des trois : ses bosses sont franches. À réserver aux
   * grandes tailles, où l'irrégularité se lit comme un geste.
   */
  {
    value: 'pebble',
    label: 'Galet',
    kind: 'traced',
    hasRadius: false,
    viewBox: '402.62 139.77 554.83 548.33',
    d: 'M910.2,446.1c-27.3,72.3-44.5,133.7-95.7,179.6c-51.2,45.9-136.4,76.5-224.1,55.8c-87.5-20.7-177.3-92.5-186.9-172s61.1-166.5,131-236.8c70-70.3,139.1-123.6,218.6-131.8c79.3-8.2,169.1,28.8,195.4,89.1S937.4,373.7,910.2,446.1z',
  },

  /*
   * Un relief en gradins, plein en bas. Pensé pour un bandeau de bas d'affiche
   * ou pour une colline derrière un texte blanc.
   */
  {
    value: 'mountain',
    label: 'Montagne',
    kind: 'traced',
    hasRadius: false,
    viewBox: '152 150.6 898.3 720.2',
    d: 'M961.5,168.3c-37.3-3-83.7-1.3-100.1,32.3c-13.2,26.8,0.8,61.6-14.1,87.4c-15.7,27.5-53.8,29.8-85.5,28.2c-31.7-1.6-69.3-0.9-87,25.4c-20.2,30,0.4,72.4-12.4,106.2c-11.8,31-48.9,45.6-82,43.6S516.5,475,485,464.5c-31.4-10.5-66.8-17-97-3.5c-39.9,17.8-58.5,64.2-93.2,90.9c-41,31.6-95.3,30.7-142.8,15.5v303.4h898.3V150.6C1029.2,169.8,992.2,170.7,961.5,168.3z',
  },

  /*
   * Le bandeau ondulé classique : une crête qui respire, un bas plein. C'est
   * la forme la plus large du catalogue — elle assume un rapport de 2,2 pour 1
   * et se déforme si on l'étire trop.
   */
  {
    value: 'wave',
    label: 'Vague',
    kind: 'traced',
    hasRadius: false,
    viewBox: '152 454.9 900 416',
    d: 'M152,454.9l30,19.2c30,19.1,90,57.5,150,91.8s120,64.7,180,64.5s120-30.8,180-58s120-50.8,180-45s120,41.2,150,58.8l30,17.7v267h-30c-30,0-90,0-150,0s-120,0-180,0s-120,0-180,0s-120,0-180,0s-120,0-150,0h-30V454.9z',
  },

  /*
   * Un bord tombant, comme un rideau tiré sur le coin. Sa diagonale appelle un
   * texte posé en face, dans le vide qu'elle laisse.
   */
  {
    value: 'curtain',
    label: 'Rideau',
    kind: 'traced',
    hasRadius: false,
    viewBox: '152 -473.7 744.7 744.6',
    d: 'M152-473.7c71.2,62.2,142.4,124.1,247.6,146.7c105.2,22.6,244.1,5.9,278.9,71.4c34.8,65.5-34.8,213.6-15.9,315.1c19.1,101.5,126.5,156.4,234.1,211.4H152V-473.7z',
  },

  /*
   * Un rectangle aux angles arrondis, légèrement incliné. Il imite un carton
   * posé de travers — utile pour un badge ou une étiquette, là où un rectangle
   * parfaitement droit paraîtrait posé à la machine.
   */
  {
    value: 'tilted-frame',
    label: 'Cadre incliné',
    kind: 'traced',
    hasRadius: false,
    viewBox: '271.15 88.25 661.69 551.51',
    d: 'M932.8,129.6l-18.1,430.8c-1,23.9-17.8,44.4-37.4,45.5L305,639.7c-19.6,1.2-34.8-17.4-33.8-41.3l18.1-430.8c1-23.9,17.8-44.4,37.4-45.5L899,88.3C918.6,87.1,933.8,105.7,932.8,129.6z',
  },

  /*
   * Le même relief que la montagne, mais en escalier plus doux et sans base
   * droite : il épouse le bas du cadre au lieu de s'y poser.
   */
  {
    value: 'hill',
    label: 'Colline',
    kind: 'traced',
    hasRadius: false,
    viewBox: '-266.81 692.45 2655.39 1617.61',
    d: 'M1784.7,753.3c-81.8,63.1-125.8,172.7-220.1,214.8c-71.5,31.9-155,16.6-229.2-8.2c-74.3-24.8-147.1-58.8-225.3-63.5c-78.2-4.7-165.9,29.7-193.7,102.9c-30.3,79.9,18.4,180-29.3,250.9c-41.8,62.1-130.8,63.7-205.6,60s-164.8,1.8-202,66.7c-35.1,61.1-2.1,143.2-33.2,206.5c-38.9,79.3-148.5,83.4-236.5,76.3c-88-7.1-197.7-2.5-236.1,77c-15.4,31.9-14.7,69-24.1,103.1c-21.6,77.5-91.4,129.5-145.9,188.6c-54.4,59.2-96.2,150.2-51.9,217.3c40,60.5,125.3,65.5,197.7,64.2c141.4-2.5,282.9-5.1,424.3-7.6c573.4-10.3,1146.8-20.6,1720.2-30.8c56.4-1,117.9-3.9,160.3-41.1c35.1-30.8,49.2-78.5,60.4-123.8c67-270.8,88.4-552.7,64.3-830.6c-16.1-185.9-3-449.5-196.5-536.2C2058.4,684.2,1899.5,664.7,1784.7,753.3z',
  },

  /*
   * Un disque aux bords légèrement irréguliers. C'est le remplaçant organique
   * du cercle : même rôle, mais un contour qui ne fait pas géométrique.
   */
  {
    value: 'soft-blob',
    label: 'Blob doux',
    kind: 'traced',
    hasRadius: false,
    viewBox: '219.3 219.3 1683.41 1683.41',
    d: 'M456.7,1686.8c-8.2-6.1-15.4-13.3-21.5-21.5C-229.5,771.5,771.5-229.5,1665.3,435.2c8.2,6.1,15.4,13.3,21.5,21.5C2351.5,1350.5,1350.5,2351.5,456.7,1686.8z',
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
