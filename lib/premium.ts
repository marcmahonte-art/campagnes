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
 * Les 6 modèles ci-dessous ne décrivent pas tous la même réalité : les deux
 * premiers sont des **campagnes déjà publiées** — leur `slug` est renseigné, le
 * CTA mène donc au parcours participant existant. Les quatre suivants sont des
 * **modèles à créer** : `slug` reste `null` tant que le descripteur n'a pas été
 * dessiné dans l'éditeur. La grille les montre tous — c'est le plan de la page —
 * mais là où le cadre n'existe pas, le bouton reste inerte et le dit, plutôt que
 * de mener à un cadre vide.
 */

import type { CampaignKind, Ratio } from './types';

/* ------------------------------------------------------------------ */
/* Événement                                                           */
/* ------------------------------------------------------------------ */

/**
 * Identité de l'événement, affichée dans le hero et le header.
 *
 * `dates` et `city` ne sont pas déduits : ils sont **lus sur les visuels
 * officiels eux-mêmes** — les deux cadres publiés ci-dessous portent la mention
 * « 30 OCT. - 08 NOV. 2026 · Ouagadougou ». Les renseigner ici les fera
 * apparaître partout, sans toucher à un composant. Une autre édition doit les
 * faire revérifier avant d'être affichée.
 */
export const SIAO = {
  name: 'SIAO',
  edition: '18ᵉ édition',
  dates: '30 oct. – 08 nov. 2026',
  city: 'Ouagadougou',
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
   * Slug de la campagne **publiée**, tel que le participant l'atteint.
   *
   * C'est le champ qui décide de tout : renseigné, « Utiliser ce template »
   * mène à `/c/:slug` — le parcours participant existant, sans compte, avec le
   * quota, l'export et le partage déjà en place. `null`, le CTA est désactivé et
   * annonce que le visuel est à venir.
   *
   * On ne fait jamais semblant : un bouton actif qui mènerait à un cadre vide
   * est pire qu'un bouton éteint. C'est aussi pourquoi le slug est recopié
   * depuis la base plutôt que déduit du titre — `Siao - Je participe au SIAO`
   * est publié sous le slug `polo-concert`, et inventer un slug à partir du
   * titre produirait un lien mort.
   */
  slug: string | null;
  /**
   * Aperçu du cadre, servi depuis `public/`.
   *
   * Jamais l'URL de la vignette en base : le produit les stocke en data URL, et
   * les inliner ici ferait livrer plusieurs mégaoctets de HTML à une page qui
   * s'ouvre depuis un QR code. Les fichiers de `public/siao/previews/` sont donc
   * des **instantanés** des vignettes — à rafraîchir si le cadre est modifié.
   */
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
    slug: 'polo-concert',
    previewImage: '/siao/previews/je-participe.webp',
    badge: null,
    description: null,
    order: 1,
    status: 'published',
  },
  {
    id: 'siao-exposant',
    title: 'Je suis exposant au SIAO 2026',
    kind: 'photo_frame',
    ratio: '1:1',
    slug: 'je-suis-exposant-au-siao',
    previewImage: '/siao/previews/je-suis-exposant.webp',
    badge: null,
    description: null,
    order: 2,
    status: 'published',
  },
  {
    id: 'siao-experience',
    title: 'Mon expérience au SIAO',
    kind: 'background_frame',
    ratio: '1:1',
    slug: null,
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
    slug: null,
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
    slug: null,
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
    slug: null,
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
 * Ne sont retirées que les campagnes explicitement `draft` **avec** un `slug` :
 * ce cas signifie « le cadre existe mais il n'est pas prêt à être montré », et
 * c'est le seul où l'affichage serait un mensonge.
 */
export function premiumCampaigns(): PremiumCampaign[] {
  return [...PREMIUM_CAMPAIGNS]
    .filter((campaign) => campaign.status === 'published' || campaign.slug === null)
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
  return campaigns.filter((campaign) => campaign.slug !== null).length;
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
