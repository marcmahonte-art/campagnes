import type { IText } from 'fabric';
import { DEFAULT_LINE_HEIGHT } from './descriptor';
import type { TextLayer } from './types';

/**
 * Fabrique unique des objets texte Fabric.
 *
 * L'éditeur, l'aperçu participant et l'export vidéo construisaient chacun leur
 * `IText` à la main — et avaient déjà divergé (le gras n'était appliqué nulle
 * part sauf dans l'éditeur). Ce module est désormais le **seul** endroit qui
 * traduit un `TextLayer` en objet Fabric : un réglage ajouté ici est appliqué
 * partout, sans risque d'oubli.
 */

/**
 * Demi-flèche maximale de l'arc, en fraction de la largeur du texte.
 * 0.35 donne, à courbure 100, une courbe franche mais encore lisible.
 */
const CURVE_AMPLITUDE = 0.35;

/**
 * Chemin SVG d'un arc dont la corde mesure `width`.
 *
 * `curve` va de -100 (arc vers le bas) à +100 (arc vers le haut). La courbe est
 * une vraie courbe de Bézier : les caractères suivent l'arc et pivotent avec
 * lui, le texte reste du texte.
 */
export function arcPathData(width: number, curve: number): string {
  const w = Math.max(1, Math.round(width));
  const sagitta = (curve / 100) * w * CURVE_AMPLITUDE;
  return `M 0 0 Q ${w / 2} ${-sagitta} ${w} 0`;
}

/** Applique — ou retire — la courbure sur un objet texte déjà construit. */
export async function applyCurve(text: IText, curve: number): Promise<void> {
  const { Path } = await import('fabric');

  if (!curve) {
    text.set({ path: undefined });
  } else {
    const width = text.width || 100;
    const arc = new Path(arcPathData(width, curve), {
      fill: 'transparent',
      stroke: 'transparent',
    });
    text.set({
      path: arc,
      pathAlign: 'center',
      pathSide: 'left',
      pathStartOffset: 0,
    });
  }

  // Le chemin change la boîte : il faut la recalculer, sinon Fabric garde
  // l'ancienne emprise et les poignées de sélection se détachent du texte.
  text.initDimensions();
  text.setCoords();
}

export interface TextObjectOptions {
  /**
   * Éditeur : le texte est modifiable au double-clic et sélectionnable.
   * Participant et export : l'objet est inerte.
   */
  interactive?: boolean;
  /**
   * Budget de largeur, en unités du ratio. Le corps est réduit tant que le texte
   * ne tient pas dedans.
   *
   * À ne pas confondre avec `width` du calque : `IText` se dimensionne sur son
   * contenu et **ignore** la largeur qu'on lui donne — c'est `Textbox` qui
   * l'honore. Pour un texte écrit librement par un participant, `width` n'est
   * donc pas une boîte mais un plafond, et sans ce plafond un texte long
   * sortirait du cadre sans que personne ne s'en aperçoive avant le
   * téléchargement.
   */
  fitWidth?: number;
  /**
   * Masque posé dans l'éditeur. Faux = le calque ne s'affiche pas.
   *
   * Le drapeau est traité ici, et non par les appelants, parce qu'il ne l'était
   * pas partout : un texte masqué restait visible dans l'aperçu participant et
   * dans les exports, alors que l'éditeur le cachait. Un réglage doit vouloir
   * dire la même chose dans tous les écrans.
   */
  visible?: boolean;
}

/**
 * Réduit le corps jusqu'à ce que le texte tienne dans `maxWidth`.
 *
 * La largeur d'un texte est quasi proportionnelle à son corps : une ou deux
 * passes suffisent à converger, et une troisième ne changerait plus rien. On
 * borne à trois par sécurité, jamais pour la précision.
 */
function fitTextToWidth(text: IText, maxWidth: number): void {
  for (let pass = 0; pass < 3 && text.width > maxWidth; pass += 1) {
    const factor = maxWidth / text.width;
    text.set({ fontSize: Math.max(8, Math.floor(text.fontSize * factor)) });
    // `set('fontSize')` ne recompose pas la boîte : sans cet appel, `width`
    // resterait celle de l'ancien corps et la boucle ne convergerait jamais.
    text.initDimensions();
  }
  text.setCoords();
}

/**
 * Construit l'objet Fabric d'un calque texte, réglages compris.
 *
 * Le `width` du calque sert de boîte de référence ; Fabric le recalcule de
 * toute façon à partir du contenu, c'est pourquoi la courbure est mesurée sur
 * `text.width` et non sur la valeur du descripteur.
 */
export async function createBrandGradient() {
  const { Gradient } = await import('fabric');
  return new Gradient({
    type: 'linear',
    gradientUnits: 'percentage',
    coords: { x1: 0, y1: 0, x2: 1, y2: 0 },
    colorStops: [
      { offset: 0, color: '#7B61FF' },
      { offset: 0.5, color: '#FF6B6B' },
      { offset: 1, color: '#FFD93D' },
    ],
  });
}

/**
 * Traduit la couleur d'un calque en remplissage Fabric.
 *
 * Exporté parce que l'aperçu participant change la couleur d'un texte **déjà
 * construit**, sans le reconstruire : sans ce point unique, la correspondance
 * « `brand-gradient` → dégradé de marque » existerait en deux exemplaires, et
 * l'aperçu finirait par ne plus montrer la même couleur que le fichier.
 */
export async function resolveTextFill(color: string): Promise<unknown> {
  return color === 'brand-gradient' ? createBrandGradient() : color;
}

export async function createTextObject(
  layer: TextLayer,
  options: TextObjectOptions = {},
): Promise<IText> {
  const { IText } = await import('fabric');
  const interactive = options.interactive ?? false;

  const text = new IText(layer.text, {
    left: layer.x,
    top: layer.y,
    angle: layer.rotation,
    opacity: layer.opacity,
    fontFamily: layer.font,
    fontSize: layer.size,
    fontWeight: layer.weight === 'bold' ? 'bold' : 'normal',
    fontStyle: layer.style === 'italic' ? 'italic' : 'normal',
    underline: Boolean(layer.underline),
    linethrough: Boolean(layer.strikethrough),
    fill: (await resolveTextFill(layer.color)) as string,
    textAlign: layer.align,
    charSpacing: layer.letterSpacing,
    lineHeight: layer.lineHeight || DEFAULT_LINE_HEIGHT,
    width: layer.w,
    originX: 'left',
    originY: 'top',
    editable: interactive,
    selectable: interactive,
    evented: interactive,
  });

  if (options.visible !== undefined) {
    text.set({ visible: options.visible } as never);
  }

  // Le plafond de largeur passe avant la courbure : la courbe se mesure sur la
  // largeur du texte, elle doit donc lire un corps déjà ajusté.
  if (options.fitWidth && options.fitWidth > 0) {
    fitTextToWidth(text, options.fitWidth);
  }

  if (layer.curve) {
    await applyCurve(text, layer.curve);
  }

  return text;
}

/**
 * Change le contenu d'un texte **déjà construit**, sans le reconstruire.
 *
 * L'aperçu participant met à jour le texte à chaque frappe. Reconstruire l'objet
 * à chaque lettre ferait perdre la position, la sélection et la fluidité ; on
 * modifie donc le texte en place — mais en réappliquant le budget de largeur,
 * sinon un texte qui s'allonge finirait par dépasser le cadre.
 */
export function setTextContent(text: IText, content: string, fitWidth?: number): void {
  // `set('text')` ne recompose pas la boîte : sans `initDimensions()`, Fabric
  // garde l'emprise de l'ancien contenu et les poignées se détachent du texte.
  text.set({ text: content });
  text.initDimensions();

  if (fitWidth && fitWidth > 0) {
    fitTextToWidth(text, fitWidth);
  }

  text.setCoords();
}
