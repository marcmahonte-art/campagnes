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

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceFcfa: 0,
    tagline: 'Je crée gratuitement.',
    audience: ['Particuliers', 'Associations', 'Petites campagnes'],
    features: [],
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    priceFcfa: 4900,
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
    highlight: true,
  },
  organization: {
    id: 'organization',
    name: 'Organisation',
    priceFcfa: 19900,
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

/** `4900` → `« 4 900 FCFA »` (espace insécable fine, convention française). */
export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(amount).replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}

export function formatPlanPrice(plan: Plan): string {
  return plan.priceFcfa === 0 ? '0 FCFA' : `${formatFcfa(plan.priceFcfa)} / mois`;
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
  { group: 'Général', label: 'Prix mensuel', free: '0 FCFA', creator: '4 900 FCFA', organization: '19 900 FCFA' },
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
