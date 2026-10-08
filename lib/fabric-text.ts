import type { IText } from 'fabric';
import { DEFAULT_LINE_HEIGHT } from './descriptor';
import { importFabric } from './fabric-runtime';
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
  const { Path } = await importFabric();

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
   * À ne pas confondre avec `w` du calque : `IText` se dimensionne sur son
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
 * Ratio d'échelle : bornes acceptées.
 *
 * Une garde, pas une préférence. Un texte dont l'échelle sort de cette bande
 * n'est pas un texte agrandi : c'est un texte dont la boîte a été mal mesurée.
 * On refuse alors de l'appliquer, pour qu'une valeur aberrante n'efface pas le
 * contenu du calque — un texte invisible est pire qu'un texte mal dimensionné.
 */
const RAPPORT_MIN = 0.02;
const RAPPORT_MAX = 40;

type TextScaleObject = {
  scaleX?: number;
  scaleY?: number;
  fontSize?: number;
  set: (props: { fontSize: number }) => unknown;
  initDimensions?: () => void;
  setCoords: () => void;
  getScaledWidth: () => number;
  getScaledHeight: () => number;
};

/**
 * Replie l'échelle d'un texte dans son **corps**, et rend la boîte à l'identique.
 *
 * ## Le problème
 *
 * Quand on étire un texte par ses poignées, Fabric change `scaleX`/`scaleY` et
 * **ne touche pas** `fontSize`. Or le descripteur ne connaît que `size` : à la
 * reconstruction, `createTextObject` rebuild un texte à son corps d'origine, et
 * le texte revient à sa taille de départ. Mesuré par
 * `tools/text-geometry-check` : agrandi ×2, il revenait à 100 % — le stockage
 * portait la bonne valeur, l'affichage mentait quand même.
 *
 * ## Pourquoi replier plutôt qu'appliquer la boîte
 *
 * On pourrait appliquer `w`/`h` à la reconstruction, comme on le fait pour les
 * images (`img.scaleX = layer.w / naturalWidth`). Pour un texte, ce serait faux :
 * `w` est une **emprise**, pas une boîte à atteindre. Un calque texte créé par
 * `makeTextLayer` annonce déjà `w = 80 % du cadre` alors qu'un mot n'occupe que
 * 173 px sur 864 : appliquer la boîte étirerait chaque texte sur toute la largeur
 * du cadre. Le panneau le sait, d'ailleurs — il masque le curseur de taille pour
 * les textes, parce que pour un texte la taille, c'est le corps.
 *
 * Donc : pour un texte, **`size` est l'unique source de taille**, et `w`/`h`
 * n'en sont que la conséquence. Replier l'échelle dans le corps respecte cette
 * hiérarchie au lieu de la concurrencer.
 *
 * ## Pourquoi c'est idempotent
 *
 * Reconstruire avec `size = corps × échelle` redonne une largeur naturelle
 * `largeur × échelle` : l'emprise est **exactement** celle d'avant, sans arrondi
 * cumulé d'un cycle à l'autre.
 *
 * ## Ce qu'on rend
 *
 * - `fontSize` : le corps à écrire dans `size` ;
 * - `width` / `height` : l'emprise **après** repli, à écrire dans `w` / `h`.
 *
 * L'objet est laissé dans l'état exact où il était à l'écran : même taille, même
 * place. Replier ne doit jamais faire bouger ce que l'utilisateur regarde.
 */
export function bakeTextScale(text: TextScaleObject): { fontSize: number; width: number; height: number } {
  const scaleX = text.scaleX ?? 1;
  const scaleY = text.scaleY ?? 1;
  const fontSize = text.fontSize ?? 16;

  // Boîte inchangée si l'échelle est saine : replier serait sans effet visible.
  const sain =
    Number.isFinite(scaleX) &&
    Number.isFinite(scaleY) &&
    scaleX >= RAPPORT_MIN &&
    scaleX <= RAPPORT_MAX &&
    scaleY >= RAPPORT_MIN &&
    scaleY <= RAPPORT_MAX;

  if (sain && Math.abs(scaleX - 1) > 1e-6) {
    const nouveauCorps = Math.max(1, Math.round(fontSize * scaleX));
    text.set({ fontSize: nouveauCorps });
    // `set('fontSize')` ne recompose pas la boîte : sans `initDimensions()`,
    // l'emprise resterait celle de l'ancien corps et les poignées se
    // décolleraient du texte.
    text.initDimensions?.();
    text.scaleX = 1;
    text.scaleY = 1;
    text.setCoords();
  }

  return {
    fontSize: Math.max(1, Math.round(text.fontSize ?? fontSize)),
    width: Math.round(text.getScaledWidth()),
    height: Math.round(text.getScaledHeight()),
  };
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

function applyBoxScale(text: IText, _targetWidth: number, _targetHeight: number): void {
  /*
   * `IText` ne doit pas être étiré pour remplir `w`/`h` : ces valeurs servent
   * souvent de budget de largeur, notamment dans le parcours participant. Les
   * appliquer comme une boîte ferait gonfler un mot court jusqu'au bord du cadre.
   */
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
  const { Gradient } = await importFabric();
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
  const { IText } = await importFabric();
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
    /*
     * `width` est SANS EFFET sur un `IText` : il se dimensionne sur son contenu
     * et ignore la largeur qu'on lui donne (c'est `Textbox` qui l'honore).
     *
     * On ne supprime pas la ligne : elle rend l'intention lisible, et un jour un
     * `Textbox` la lirait pour de bon. Mais se fier à elle pour la taille à
     * l'écran serait une erreur — d'où `bakeTextScale`, qui replie l'échelle du
     * canvas dans le corps.
     */
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

  /*
   * Pas d'application de la boîte ici, et c'est délibéré.
   *
   * Pour une image, `w` est une boîte à atteindre : l'éditeur fait
   * `img.scaleX = layer.w / naturalWidth` et l'aller-retour est exact. Pour un
   * texte, `w` est une **emprise**, et elle est vide avant la première mesure.
   * L'appliquer ici étirerait chaque texte court sur toute la largeur du cadre.
   *
   * La taille d'un texte passe donc par son corps : c'est `bakeTextScale` qui,
   * à l'émission, replie l'échelle du canvas dans `size`.
   */
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
