/**
 * Plans, fonctionnalités et droits — source unique de vérité.
 *
 * Le modèle est volontairement binaire : un plan **a** ou **n'a pas** un module.
 * La distribution, elle, est facturée à l'usage et sur devis : elle ne fait donc
 * pas partie des droits, et vit séparément dans `lib/distribution.ts`.
 */

export type PlanId = 'free' | 'creator' | 'organization';

export type PlanFeature =
  | 'campaigns_unlimited'
  | 'no_watermark'
  | 'frame_pro'
  | 'templates_premium'
  | 'motion'
  | 'analytics'
  | 'qr'
  | 'branding'
  | 'domain'
  | 'multi_user'
  | 'private_gallery'
  | 'reports'
  | 'support_priority';

export interface Plan {
  id: PlanId;
  name: string;
  /** Prix mensuel en FCFA. 0 pour le plan gratuit. */
  priceFcfa: number;
  /** Une phrase : à qui s'adresse ce plan. */
  tagline: string;
  /** Publics visés, repris du document de tarification. */
  audience: string[];
  /** Modules inclus — sert au verrouillage dans le produit. */
  features: PlanFeature[];
  /** Mise en avant visuelle sur la page tarifs. */
  highlight?: boolean;
}

/**
 * N5 — rien ici qui ne soit développé.
 *
 * `campaigns_unlimited` n'est pas un module à verrouiller : la limite de
 * campagnes est quantitative, lue via `maxCampaigns()` (1 en Gratuit, illimité
 * ensuite). Il en va de même des modules entreprise (`domain`, `multi_user`,
 * `private_gallery`, `reports`) et du `support_priority` : aucun écran,
 * aucune API, aucun différenciateur.
 */
const CREATOR_FEATURES: PlanFeature[] = [
  'no_watermark',
  'frame_pro',
  'templates_premium',
  'motion',
  'analytics',
  'qr',
  'branding',
];

const ORGANIZATION_FEATURES: PlanFeature[] = [...CREATOR_FEATURES];

import { PRICING_PLANS, formatFcfaPrice } from '@/lib/pricing/config';

/*
 * Les fonctions listées ici correspondent à du code livré et à un verrou réel
 * (`hasFeature` est appelé dans l'application). Voir la colonne « N5 » du
 * rapport de phase U1 : `domain`, `multi_user`, `private_gallery`, `reports`
 * et `support_priority` ont été retirés de la segmentation des formules — ils
 * appartiennent au palier « Sur devis » et ne sont pas développés.
 */

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    priceFcfa: PRICING_PLANS.free.monthlyPriceFcfa,
    tagline: 'Je crée gratuitement.',
    audience: ['Particuliers', 'Associations', 'Petites campagnes'],
    features: [],
  },
  creator: {
    id: 'creator',
    name: 'Créateur',
    priceFcfa: PRICING_PLANS.creator.monthlyPriceFcfa,
    tagline: 'Je paie un abonnement pour avoir les outils professionnels.',
    audience: [
      'Agences de communication',
      'Agences événementielles',
      'Community managers',
      'Graphistes',
      'Créateurs de contenu',
      'Organisateurs d’événements',
      'PME et petites marques',
    ],
    features: CREATOR_FEATURES,
    highlight: false,
  },
  organization: {
    id: 'organization',
    name: 'Organisations & ONG',
    priceFcfa: PRICING_PLANS.organization.monthlyPriceFcfa,
    tagline: 'Je paie un abonnement pour gérer mes campagnes et mon équipe.',
    audience: [
      'ONG',
      'Grandes associations',
      'Entreprises',
      'Universités et écoles',
      'Institutions',
      'Grandes campagnes',
    ],
    features: ORGANIZATION_FEATURES,
    highlight: true,
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.creator, PLANS.organization];

/* ------------------------------------------------------------------ */
/* Droits                                                              */
/* ------------------------------------------------------------------ */

export function planOf(plan: PlanId | string | null | undefined): Plan {
  if (plan === 'creator') return PLANS.creator;
  if (plan === 'organization') return PLANS.organization;
  return PLANS.free;
}

/** Vrai si le plan courant inclut le module demandé. */
export function hasFeature(
  plan: PlanId | string | null | undefined,
  feature: PlanFeature,
): boolean {
  return planOf(plan).features.includes(feature);
}

export function isPaidPlan(plan: PlanId | string | null | undefined): boolean {
  return planOf(plan).priceFcfa > 0;
}

/** Plan immédiatement supérieur, pour l'invitation à changer d'offre. */
export function nextPlan(plan: PlanId | string | null | undefined): Plan | null {
  if (plan === 'creator') return PLANS.organization;
  if (plan === 'free' || !plan) return PLANS.creator;
  return null;
}

/* ------------------------------------------------------------------ */
/* Limites quantitatives                                               */
/* ------------------------------------------------------------------ */

/**
 * Nombre maximal de calques par cadre pour une formule sans Frame Pro.
 *
 * La limite découle de `frame_pro` et non d'une liste de formules : ajouter
 * une formule demain ne demande donc aucune modification ici.
 */
export const FREE_MAX_LAYERS = 3;

/**
 * Plafond de calques par cadre. `null` = illimité.
 *
 * Un seul point de vérité : l'éditeur ne décide pas de ce qu'il autorise, il
 * applique ce que la formule accorde.
 */
export function maxLayers(plan: PlanId | string | null | undefined): number | null {
  return hasFeature(plan, 'frame_pro') ? null : FREE_MAX_LAYERS;
}

/**
 * Nombre maximal de campagnes pour la formule Gratuit.
 *
 * La limite est **par compte, pas par campagne** : sans elle, il suffirait de
 * créer une nouvelle campagne pour repartir avec un quota offert (voir la
 * grille tarifaire). Elle ne s'applique qu'aux nouvelles créations — les
 * campagnes existantes d'un compte gratuit continuent de fonctionner.
 */
export const FREE_MAX_CAMPAIGNS = 1;

/**
 * Plafond de campagnes par compte. `null` = illimité.
 *
 * Un seul point de vérité : le dashboard, le formulaire de création, le client
 * Supabase et le trigger SQL appliquent tous cette règle, lue ici.
 */
export function maxCampaigns(plan: PlanId | string | null | undefined): number | null {
  return isPaidPlan(plan) ? null : FREE_MAX_CAMPAIGNS;
}

/* ------------------------------------------------------------------ */
/* Libellés et formatage                                               */
/* ------------------------------------------------------------------ */

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  campaigns_unlimited: 'Campagnes illimitées',
  no_watermark: 'Suppression du watermark',
  frame_pro: 'Frame Pro',
  templates_premium: 'Templates premium',
  motion: 'Animation IA',
  analytics: 'Analytics',
  qr: 'QR Code',
  branding: 'Branding',
  domain: 'Domaine personnalisé',
  multi_user: 'Multi-utilisateurs',
  private_gallery: 'Galerie privée',
  reports: 'Rapports PDF et export CSV',
  support_priority: 'Support prioritaire',
};

/** Formate un montant en FCFA avec espace insécable fine (ex: 3 000 FCFA). */
export function formatFcfa(amount: number): string {
  return formatFcfaPrice(amount);
}

export function formatPlanPrice(plan: Plan): string {
  return plan.priceFcfa === 0 ? '0 FCFA' : `${formatFcfa(plan.priceFcfa)} / mois`;
}

/** Adresse de contact pour activer une formule payante. */
export const PLANS_CONTACT_EMAIL = 'bonjour@campagnes.app';

/**
 * Demande d'activation d'une formule, pré-remplie.
 *
 * Même principe que `quoteHref()` pour la distribution : tant qu'aucun
 * prestataire de paiement n'est branché, une formule payante s'obtient par un
 * contact, jamais par un bouton. Un bouton qui n'active rien serait un mensonge.
 */
export function planContactHref(plan: Plan): string {
  const subject = `Activation de la formule ${plan.name}`;
  const body =
    'Bonjour,\n\n' +
    `Je souhaite activer la formule ${plan.name} (${formatPlanPrice(plan)}).\n\n` +
    "Nom de l'organisation : \n" +
    "Nom d'utilisateur : \n\n";
  return `mailto:${PLANS_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* ------------------------------------------------------------------ */
/* Matrice comparative (§20 du document de tarification)               */
/* ------------------------------------------------------------------ */

export interface ComparisonRow {
  label: string;
  free: string | boolean;
  creator: string | boolean;
  organization: string | boolean;
  /**
   * Groupe d'appartenance, pour aérer le tableau.
   *
   * « Organisation » a disparu avec la ligne « Support prioritaire » (N5) :
   * on ne crée pas un groupe vide pour une section qui n'a plus de contenu.
   */
  group: 'Général' | 'Création' | 'Modules' | 'Distribution';
}

/**
 * Matrice comparative.
 *
 * Règles appliquées :
 *  - **Aucun montant n'est écrit ici** (N3) : les trois lignes chiffrées lisent
 *    la config de tarification. Changer un prix dans `lib/pricing/config.ts`
 *    suffit, cette table suit.
 *  - **Aucune fonctionnalité non développée** (N5) : chaque ligne renvoie à un
 *    verrou réel (`hasFeature`) ou à un comportement observable. « Support
 *    prioritaire » a été retiré : aucun écran, aucune API, aucun délai garanti.
 *  - Le filigrane est décrit tel qu'il se passe : « Filigrane Campagnes » côté
 *    gratuit, « sans filigrane tant que le quota n'est pas épuisé » côté payant
 *    — jamais « Oui / Non », qui laisse croire à une absence de limite.
 */
export const COMPARISON: ComparisonRow[] = [
  {
    group: 'Général',
    label: 'Prix mensuel',
    free: formatFcfa(PRICING_PLANS.free.monthlyPriceFcfa),
    creator: formatFcfa(PRICING_PLANS.creator.monthlyPriceFcfa),
    organization: formatFcfa(PRICING_PLANS.organization.monthlyPriceFcfa),
  },
  {
    group: 'Général',
    label: 'Distributions incluses',
    free: PRICING_PLANS.free.quotaLabel,
    creator: PRICING_PLANS.creator.quotaLabel,
    organization: PRICING_PLANS.organization.quotaLabel,
  },
  {
    group: 'Général',
    label: 'Coût par participant inclus',
    free: '—',
    creator: formatFcfa(PRICING_PLANS.creator.costPerParticipantFcfa ?? 0),
    organization: formatFcfa(PRICING_PLANS.organization.costPerParticipantFcfa ?? 0),
  },
  {
    group: 'Général',
    label: 'Filigrane Campagnes',
    free: PRICING_PLANS.free.watermarkLabel,
    creator: PRICING_PLANS.creator.watermarkLabel,
    organization: PRICING_PLANS.organization.watermarkLabel,
  },
  {
    group: 'Général',
    label: 'Campagnes',
    free: `${FREE_MAX_CAMPAIGNS}`,
    creator: 'Illimitées',
    organization: 'Illimitées',
  },
  { group: 'Général', label: 'Galerie publique', free: true, creator: true, organization: true },
  {
    group: 'Général',
    label: 'Utiliser une campagne existante',
    free: true,
    creator: true,
    organization: true,
  },
  {
    group: 'Création',
    label: 'Personnalisation du visuel',
    free: true,
    creator: true,
    organization: true,
  },
  { group: 'Création', label: 'Formes et textes', free: false, creator: true, organization: true },
  { group: 'Création', label: 'Photo', free: true, creator: true, organization: true },
  { group: 'Création', label: 'Vidéo', free: true, creator: true, organization: true },
  { group: 'Création', label: '3 formats', free: true, creator: true, organization: true },
  { group: 'Création', label: 'Lien de campagne', free: true, creator: true, organization: true },
  { group: 'Création', label: 'Exports sans filigrane', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'Frame Pro', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'Modèles de cadres', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'Animation', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'Statistiques de participation', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'QR Code', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'Branding', free: false, creator: true, organization: true },
  {
    group: 'Distribution',
    label: 'Crédits de distribution',
    free: 'À l’usage',
    creator: 'À l’usage',
    organization: 'À l’usage',
  },
];

/* ------------------------------------------------------------------ */
/* Modules premium (§17 du document)                                   */
/* ------------------------------------------------------------------ */

export interface PremiumModule {
  id: string;
  name: string;
  feature: PlanFeature;
  description: string;
  /** Minimum plan qui débloque le module. */
  availableFrom: PlanId;
}

export const PREMIUM_MODULES: PremiumModule[] = [
  {
    id: 'frame-pro',
    name: 'Frame Pro',
    feature: 'frame_pro',
    /*
     * Description alignée sur les verrous réels : ce module ouvre les formes,
     * les textes et le nombre de calques. Les modèles sont un module à part
     * (`templates_premium`) — les annoncer ici promettrait un déverrouillage
     * que cette entrée ne donne pas.
     */
    description: 'Formes, textes et calques illimités dans le cadre.',
    availableFrom: 'creator',
  },
  {
    /*
     * Les modèles de cadres sont un module **à part entière**, pas un détail de
     * Frame Pro : la bibliothèque est le premier verrou qu'un créateur gratuit
     * rencontre, avant même d'avoir composé quoi que ce soit. Il lui faut donc
     * sa propre entrée, pour que l'interface sache quelle formule proposer.
     */
    id: 'templates',
    name: 'Modèles de cadres',
    feature: 'templates_premium',
    description:
      'Bibliothèque de modèles prêts à l’emploi, conçus pour les événements et les campagnes.',
    availableFrom: 'creator',
  },
  {
    id: 'motion',
    name: 'Animation',
    feature: 'motion',
    description: 'Animation des cadres et export vidéo.',
    availableFrom: 'creator',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    feature: 'analytics',
    description: 'Statistiques détaillées par campagne.',
    availableFrom: 'creator',
  },
  {
    id: 'qr',
    name: 'QR Code',
    feature: 'qr',
    description: 'QR code automatique de campagne.',
    availableFrom: 'creator',
  },
  {
    id: 'branding',
    name: 'Branding',
    feature: 'branding',
    description: 'Logo, couleurs de marque, suppression du filigrane.',
    availableFrom: 'creator',
  },
];
