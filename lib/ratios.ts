import type { Ratio } from './types';

/**
 * Les trois formats, en langage naturel.
 * On ne montre JAMAIS une résolution technique à l'utilisateur (§12 du design system).
 * Ces dimensions sont le repère interne du descripteur : c'est ce qui rend un cadre
 * rejouable à l'identique quel que soit l'écran.
 */
export interface RatioSpec {
  id: Ratio;
  label: string;
  usage: string;
  width: number;
  height: number;
}

export const RATIOS: Record<Ratio, RatioSpec> = {
  '1:1': {
    id: '1:1',
    label: 'Carré',
    usage: 'Publications, photos de profil',
    width: 1080,
    height: 1080,
  },
  '16:9': {
    id: '16:9',
    label: 'Paysage',
    usage: 'Écrans, présentations, YouTube',
    width: 1920,
    height: 1080,
  },
  '9:16': {
    id: '9:16',
    label: 'Vertical',
    usage: 'Stories, Reels, TikTok, WhatsApp',
    width: 1080,
    height: 1920,
  },
};

export const RATIO_LIST: RatioSpec[] = [RATIOS['1:1'], RATIOS['16:9'], RATIOS['9:16']];

export function ratioSpec(ratio: Ratio): RatioSpec {
  return RATIOS[ratio] ?? RATIOS['1:1'];
}

export function isRatio(value: unknown): value is Ratio {
  return value === '1:1' || value === '16:9' || value === '9:16';
}
