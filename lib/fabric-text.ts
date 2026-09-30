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
}

/**
 * Construit l'objet Fabric d'un calque texte, réglages compris.
 *
 * Le `width` du calque sert de boîte de référence ; Fabric le recalcule de
 * toute façon à partir du contenu, c'est pourquoi la courbure est mesurée sur
 * `text.width` et non sur la valeur du descripteur.
 */
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
    fill: layer.color,
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

  if (layer.curve) {
    await applyCurve(text, layer.curve);
  }

  return text;
}
