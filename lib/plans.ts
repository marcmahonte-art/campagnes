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

const CREATOR_FEATURES: PlanFeature[] = [
  'campaigns_unlimited',
  'no_watermark',
  'frame_pro',
  'templates_premium',
  'motion',
  'analytics',
  'qr',
  'branding',
  'support_priority',
];

const ORGANIZATION_FEATURES: PlanFeature[] = [
  ...CREATOR_FEATURES,
  'domain',
  'multi_user',
  'private_gallery',
  'reports',
];

import { PRICING_PLANS, formatFcfaPrice } from '@/lib/pricing/config';

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
  /** Groupe d'appartenance, pour aérer le tableau. */
  group: 'Général' | 'Création' | 'Modules' | 'Organisation' | 'Distribution';
}

export const COMPARISON: ComparisonRow[] = [
  {
    group: 'Général',
    label: 'Prix mensuel',
    free: '0 FCFA',
    creator: formatFcfa(PRICING_PLANS.creator.monthlyPriceFcfa),
    organization: formatFcfa(PRICING_PLANS.organization.monthlyPriceFcfa),
  },
  {
    group: 'Général',
    label: 'Distributions incluses / mois',
    free: '25 à vie',
    creator: '100 / mois',
    organization: '1 000 / mois',
  },
  {
    group: 'Général',
    label: 'Coût par participant inclus',
    free: '—',
    creator: '30 FCFA',
    organization: '5 FCFA',
  },
  { group: 'Général', label: 'Campagnes', free: true, creator: true, organization: true },
  { group: 'Général', label: 'Galerie', free: true, creator: true, organization: true },
  { group: 'Général', label: 'Utiliser une campagne existante', free: true, creator: true, organization: true },
  { group: 'Création', label: 'Personnalisation', free: true, creator: true, organization: true },
  { group: 'Création', label: 'Photo', free: true, creator: true, organization: true },
  { group: 'Création', label: 'Vidéo', free: true, creator: true, organization: true },
  { group: 'Création', label: '3 formats', free: true, creator: true, organization: true },
  { group: 'Création', label: 'Lien de campagne', free: true, creator: true, organization: true },
  { group: 'Création', label: 'Watermark', free: 'Oui', creator: 'Non', organization: 'Non' },
  { group: 'Modules', label: 'Frame Pro', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'Animation IA (Motion)', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'Analytics', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'QR Code', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'Branding', free: false, creator: true, organization: true },
  { group: 'Modules', label: 'Domaine personnalisé', free: false, creator: false, organization: true },
  { group: 'Organisation', label: 'Multi-utilisateurs', free: false, creator: false, organization: true },
  { group: 'Organisation', label: 'Galerie privée', free: false, creator: false, organization: true },
  { group: 'Organisation', label: 'Rapports PDF', free: false, creator: false, organization: true },
  { group: 'Organisation', label: 'Support prioritaire', free: false, creator: true, organization: true },
  { group: 'Distribution', label: 'Distribution', free: 'À l’usage', creator: 'À l’usage', organization: 'À l’usage' },
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
    description: 'Cadres avancés, multi-calques, templates premium.',
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
    name: 'Motion',
    feature: 'motion',
    description: 'Animation IA des cadres, rendu vidéo.',
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
    description: 'Logo, couleurs de marque, suppression du watermark.',
    availableFrom: 'creator',
  },
  {
    id: 'domain',
    name: 'Domaine',
    feature: 'domain',
    description: 'Domaine personnalisé.',
    availableFrom: 'organization',
  },
  {
    id: 'reports',
    name: 'Reports',
    feature: 'reports',
    description: 'Export CSV et rapports PDF pour les sponsors.',
    availableFrom: 'organization',
  },
];
