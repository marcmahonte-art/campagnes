import { Image as ImageIcon, Images, Video } from 'lucide-react';
import type { CampaignKind, Descriptor, Ratio } from './types';
import { ratioSpec } from './ratios';

/**
 * Les trois façons d'accueillir le média du participant, en langage naturel.
 *
 * Le vocabulaire est volontairement aligné sur celui du descripteur
 * (« mode Cadre » / « mode Fond ») : le créateur ne voit jamais une
 * différence entre ce qu'il choisit ici et ce qu'il dessine ensuite.
 */
export interface KindSpec {
  id: CampaignKind;
  label: string;
  /** Phrase courte : ce que le participant fera, pas comment ça marche. */
  usage: string;
  detail: string;
  icon: typeof ImageIcon;
  /**
   * Ce que le participant dépose, en clair. Purement indicatif : sert à lever
   * l'ambiguïté au moment du choix, jamais à filtrer un fichier.
   */
  formats: string[];
}

export const KIND_SPECS: KindSpec[] = [
  {
    id: 'photo_frame',
    label: 'Cadre photo',
    usage: 'Les participants ajoutent une photo',
    detail: 'La photo remplit tout le cadre et n’apparaît qu’à travers les zones vides du visuel.',
    icon: ImageIcon,
    formats: ['PNG'],
  },
  {
    id: 'video_frame',
    label: 'Cadre vidéo',
    usage: 'Les participants ajoutent une vidéo',
    detail: 'Un cadre animé s’applique à la vidéo du participant, image par image.',
    icon: Video,
    formats: ['MP4', 'GIF'],
  },
  {
    id: 'background_frame',
    label: 'Photo sur fond',
    usage: 'Les participants ajoutent une photo',
    detail: 'La photo est posée dans une zone du décor : le fond reste visible tout autour.',
    icon: Images,
    formats: ['Photo', 'Vidéo'],
  },
];

export const CAMPAIGN_KINDS: CampaignKind[] = KIND_SPECS.map((s) => s.id);

export function kindSpec(kind: CampaignKind): KindSpec {
  return KIND_SPECS.find((s) => s.id === kind) ?? KIND_SPECS[0];
}

export function isCampaignKind(value: unknown): value is CampaignKind {
  return CAMPAIGN_KINDS.includes(value as CampaignKind);
}

/** Format conseillé : une campagne vidéo se partage rarement en paysage. */
export function defaultRatioFor(kind: CampaignKind): Ratio {
  return kind === 'video_frame' ? '9:16' : '1:1';
}

/**
 * Calque d'amorce du mode Fond : un rectangle vide au centre du cadre que le
 * créateur designate ensuite comme zone photo. On le crée ici plutôt que de
 * le laisser découvrir l'éditeur, parce que c'est le seul des trois modes qui
 * demande une action supplémentaire avant d'être visible.
 */
const ZONE_MARGIN = 0.08;

export function starterZoneLayerId(ratio: Ratio): string {
  return `zone-${ratio.replace(':', '-')}`;
}

/**
 * Premier descripteur d'une campagne, cohérent avec le type choisi.
 *
 * - photo_frame / video_frame : cadre transparent, le participant remplit tout.
 * - background_frame : une zone photo est déjà présente, pour que le créateur
 *   n'ait plus qu'à la dimensionner.
 */
export function seedDescriptorFor(kind: CampaignKind, ratio: Ratio): Descriptor {
  const base: Descriptor = {
    version: 1,
    ratio,
    background: 'transparent',
    layers: [],
    motion: null,
  };

  if (kind !== 'background_frame') return base;

  const spec = ratioSpec(ratio);
  const w = Math.round(spec.width * (1 - ZONE_MARGIN * 2));
  const h = Math.round(spec.height * (1 - ZONE_MARGIN * 2));
  const id = starterZoneLayerId(ratio);

  // Rectangle 1×1 transparent : il n'imprime rien, il ne sert qu'à matérialiser
  // la zone que le parcours participant remplira.
  return {
    ...base,
    photo_anchor: id,
    layers: [
      {
        id,
        type: 'image',
        src:
          'data:image/svg+xml;charset=utf-8,' +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`,
          ),
        label: 'Zone photo',
        x: Math.round((spec.width - w) / 2),
        y: Math.round((spec.height - h) / 2),
        w,
        h,
        rotation: 0,
        z: 10,
        opacity: 1,
      },
    ],
  };
}
