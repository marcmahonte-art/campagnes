/**
 * Campagnes événementielles SIAO 2026 — source unique.
 *
 * La page `/premium` est une **vitrine** : elle présente des modèles, et rien
 * d'autre. Tout ce qu'elle affiche vient d'ici, jamais du JSX. Ajouter une
 * septième campagne doit se limiter à une entrée dans ce tableau — si un jour
 * il faut toucher à un composant pour ajouter une carte, c'est que la structure
 * a échoué.
 *
 * **Aucune donnée inventée.** Le SIAO est un salon réel, et cette page sera
 * ouverte par un QR code sur un stand : une date approximative ou un lieu
 * plausible y serait vu par des milliers de personnes. Les seules valeurs
 * certaines sont donc écrites en clair, et tout le reste est marqué `null` —
 * l'interface affiche alors une invitation à compléter, jamais une supposition.
 *
 * Les 6 modèles ci-dessous décrivent des **campagnes à créer**, pas des
 * campagnes existantes : leurs `templateId` valent `null` tant que les
 * descripteurs correspondants n'ont pas été dessinés dans l'éditeur. La grille
 * les montre quand même — c'est le plan de la page — mais le bouton « Utiliser
 * ce template » reste inerte et le dit, plutôt que de mener à un cadre vide.
 */

import type { CampaignKind, Ratio } from './types';

/* ------------------------------------------------------------------ */
/* Événement                                                           */
/* ------------------------------------------------------------------ */

/**
 * Identité de l'événement, affichée dans le hero et le header.
 *
 * `dates` et `city` sont laissés à `null` par défaut : la maquette les
 * mentionne, mais rien dans le dépôt ne les confirme. Les renseigner ici les
 * fera apparaître partout, sans toucher à un composant.
 */
export const SIAO = {
  name: 'SIAO',
  edition: '18ᵉ édition',
  dates: null as string | null,
  city: null as string | null,
  /** Hashtags officiels, repris des visuels fournis. */
  hashtags: ['#SIAO2026', '#Artisanat', '#BurkinaFaso'],
} as const;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface PremiumCampaign {
  /** Identifiant stable, utilisé comme clé React et pour l'analytique. */
  id: string;
  title: string;
  /** Nature d'accueil du média — c'est `kindSpec()` qui donne le libellé. */
  kind: CampaignKind;
  ratio: Ratio;
  /**
   * Modèle réellement branché, ou `null` si le descripteur n'existe pas encore.
   *
   * C'est le champ qui décide de tout : renseigné, le CTA mène au parcours
   * participant ; `null`, le CTA est désactivé et annonce que le visuel est à
   * venir. On ne fait jamais semblant — un bouton qui mène à un cadre vide est
   * pire qu'un bouton éteint.
   */
  templateId: string | null;
  /** Visuel d'aperçu. `null` → cadre de remplacement, jamais une image inventée. */
  previewImage: string | null;
  /** Pastille courte, par exemple « Officielle ». */
  badge: string | null;
  /** Une phrase au plus. `null` → aucune ligne de description. */
  description: string | null;
  /** Ordre d'affichage. */
  order: number;
  status: 'published' | 'draft';
}

/* ------------------------------------------------------------------ */
/* Les 6 campagnes                                                     */
/* ------------------------------------------------------------------ */

export const PREMIUM_CAMPAIGNS: PremiumCampaign[] = [
  {
    id: 'siao-participation',
    title: 'Je participe au SIAO 2026',
    kind: 'photo_frame',
    ratio: '1:1',
    templateId: null,
    previewImage: null,
    badge: null,
    description: null,
    order: 1,
    status: 'draft',
  },
  {
    id: 'siao-exposant',
    title: 'Je suis exposant au SIAO 2026',
    kind: 'photo_frame',
    ratio: '1:1',
    templateId: null,
    previewImage: null,
    badge: null,
    description: null,
    order: 2,
    status: 'draft',
  },
  {
    id: 'siao-experience',
    title: 'Mon expérience au SIAO',
    kind: 'background_frame',
    ratio: '1:1',
    templateId: null,
    previewImage: null,
    badge: null,
    description: null,
    order: 3,
    status: 'draft',
  },
  {
    id: 'siao-artisan-prefere',
    title: 'Mon artisan préféré',
    kind: 'photo_frame',
    ratio: '1:1',
    templateId: null,
    previewImage: null,
    badge: null,
    description: null,
    order: 4,
    status: 'draft',
  },
  {
    id: 'siao-decouverte',
    title: "Je découvre l'artisanat africain",
    kind: 'background_frame',
    ratio: '1:1',
    templateId: null,
    previewImage: null,
    badge: null,
    description: null,
    order: 5,
    status: 'draft',
  },
  {
    id: 'siao-officielle',
    title: 'SIAO 2026 — Officielle',
    kind: 'photo_frame',
    ratio: '1:1',
    templateId: null,
    previewImage: null,
    badge: 'Officielle',
    description: null,
    order: 6,
    status: 'draft',
  },
];

/**
 * Les campagnes affichées, dans l'ordre.
 *
 * **Aucun filtre de statut.** C'est une décision, pas un oubli : la page existe
 * pour montrer le plan de l'événement, et une grille à moitié vide serait un
 * aveu d'échec plutôt qu'un programme. Un modèle dont le visuel n'est pas encore
 * dessiné s'affiche donc avec un emplacement vide et un bouton éteint — le
 * visiteur voit ce qui arrive, au lieu de ne rien voir.
 *
 * Ne sont retirées que les campagnes explicitement `draft` **avec** un
 * `templateId` : ce cas signifie « le visuel existe mais il n'est pas prêt à
 * être montré », et c'est le seul où l'affichage serait un mensonge.
 */
export function premiumCampaigns(): PremiumCampaign[] {
  return [...PREMIUM_CAMPAIGNS]
    .filter((campaign) => campaign.status === 'published' || campaign.templateId === null)
    .sort((a, b) => a.order - b.order);
}

/**
 * Combien de modèles sont réellement utilisables.
 *
 * La page s'en sert pour dire la vérité à l'endroit où le visiteur s'attend à
 * cliquer : tant que ce nombre vaut zéro, aucune carte ne doit laisser croire
 * qu'elle mène quelque part.
 */
export function readyCount(campaigns: PremiumCampaign[] = premiumCampaigns()): number {
  return campaigns.filter((campaign) => campaign.templateId !== null).length;
}

/* ------------------------------------------------------------------ */
/* Parcours                                                            */
/* ------------------------------------------------------------------ */

export interface PremiumStep {
  /** Numéro affiché. */
  step: number;
  /** Verbe à l'impératif : ce que le visiteur fait. */
  action: string;
  /** Une phrase, jamais deux. */
  detail: string;
  /** Icône lucide, choisie par la page pour ne pas lier ce module à l'UI. */
  icon: 'grid' | 'eye' | 'mousePointer' | 'image' | 'download' | 'share';
}

export const PREMIUM_STEPS: PremiumStep[] = [
  {
    step: 1,
    action: 'Découvrez',
    detail: 'Explorez les campagnes disponibles dans la galerie.',
    icon: 'grid',
  },
  {
    step: 2,
    action: 'Choisissez',
    detail: 'Consultez le template et ses détails.',
    icon: 'eye',
  },
  {
    step: 3,
    action: 'Utilisez',
    detail: 'Cliquez sur « Utiliser ce template » pour créer votre visuel.',
    icon: 'mousePointer',
  },
  {
    step: 4,
    action: 'Personnalisez',
    detail: 'Ajoutez votre photo ou votre vidéo et personnalisez si besoin.',
    icon: 'image',
  },
  {
    step: 5,
    action: 'Téléchargez',
    detail: 'Récupérez votre visuel final.',
    icon: 'download',
  },
  {
    step: 6,
    action: 'Partagez',
    detail: 'Partagez vos réseaux et faites rayonner le SIAO !',
    icon: 'share',
  },
];
