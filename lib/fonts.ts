import type { FontFamily } from './types';

/**
 * Source unique de vérité sur les polices de l'éditeur.
 *
 * Chaque police déclare ici les variantes qu'elle **possède réellement**.
 * C'est ce qui permet aux boutons Gras et Italique de ne jamais mentir : une
 * police sans variante grasse désactive le bouton au lieu de laisser le
 * navigateur fabriquer un faux gras.
 *
 * Les polices sont chargées par `app/layout.tsx` via `next/font/google` ; le
 * `fontFamily` du descripteur est le **nom affiché** ci-dessous, jamais une
 * variable CSS.
 */

export interface FontSpec {
  value: FontFamily;
  label: string;
  /** La police embarque une vraie graisse grasse. */
  hasBold: boolean;
  /** La police embarque une vraie italique. */
  hasItalic: boolean;
  /** Note affichée quand une variante manque. */
  note?: string;
}

export const FONTS: readonly FontSpec[] = [
  { value: 'Inter', label: 'Inter', hasBold: true, hasItalic: true },
  { value: 'Playfair Display', label: 'Playfair Display', hasBold: true, hasItalic: true },
  { value: 'Montserrat', label: 'Montserrat', hasBold: true, hasItalic: true },
  { value: 'Poppins', label: 'Poppins', hasBold: true, hasItalic: true },
  { value: 'Roboto', label: 'Roboto', hasBold: true, hasItalic: true },
  { value: 'Lora', label: 'Lora', hasBold: true, hasItalic: true },
  {
    value: 'Bebas Neue',
    label: 'Bebas Neue',
    hasBold: false,
    hasItalic: false,
    note: 'Bebas Neue n’existe qu’en graisse normale, sans italique.',
  },
];

const BY_VALUE = new Map<FontFamily, FontSpec>(FONTS.map((f) => [f.value, f]));

/** Capacités d'une police. Repli sûr : aucune variante annoncée. */
export function fontSpec(font: FontFamily): FontSpec {
  return (
    BY_VALUE.get(font) ?? {
      value: font,
      label: font,
      hasBold: false,
      hasItalic: false,
    }
  );
}

/** Les noms de police valides, dans l'ordre d'affichage. */
export const FONT_VALUES: readonly FontFamily[] = FONTS.map((f) => f.value);

export function isFontFamily(value: unknown): value is FontFamily {
  return typeof value === 'string' && BY_VALUE.has(value as FontFamily);
}
