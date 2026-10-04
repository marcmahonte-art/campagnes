/**
 * Source unique de vérité pour la tarification Campagnes.
 *
 * Devise : FCFA (XOF) · Marché : UEMOA
 * Conforme à : `docs/monétisation/grille-tarifaire.md` et `docs/monétisation/monetisation-campagnes.md`
 *
 * Règle N3 : Aucun montant en dur ne doit exister dans un composant.
 * Règle N5 : Aucune fonctionnalité non développée n'est affichée comme disponible.
 */

export type BillingDuration = '1m' | '6m' | '12m';

export interface PlanPricingPeriod {
  /** Montant total prépayé pour la période en FCFA */
  totalFcfa: number;
  /** Montant total barré au prorata mensuel simple (mensuel × mois) */
  strikethroughTotalFcfa?: number;
  /** Équivalent mensuel pour l'affichage */
  monthlyEquivalentFcfa: number;
  /** Argument commercial explicite (ex: « 1 mois offert », « 3 mois offerts ») */
  savingsLabel?: string;
  /** Pourcentage de réduction (≤ 25 %) */
  discountPercent?: number;
}

export interface PricingPlanConfig {
  id: 'free' | 'creator' | 'organization';
  name: string;
  tagline: string;
  monthlyPriceFcfa: number;
  /** Distributions mensuelles incluses (25 à vie pour Gratuit) */
  includedDistributions: number;
  isLifetimeQuota?: boolean;
  /** Coût indicatif par participant inclus */
  costPerParticipantFcfa?: number;
  costPerParticipantLabel?: string;
  /** Périodes de facturation (prépaiements) */
  periods: Record<BillingDuration, PlanPricingPeriod>;
  features: string[];
  highlight?: boolean;
  highlightLabel?: string;
  ctaText: string;
}

export const PRICING_PERIODS: {
  id: BillingDuration;
  label: string;
  months: number;
  badge?: string;
}[] = [
  { id: '1m', label: '1 mois', months: 1 },
  { id: '6m', label: '6 mois', months: 6, badge: '1 mois offert' },
  { id: '12m', label: '1 an (12 mois)', months: 12, badge: '3 mois offerts' },
];

export const PRICING_PLANS: Record<'free' | 'creator' | 'organization', PricingPlanConfig> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    tagline: 'Découverte — pour tester et lancer ses premières campagnes sans frais.',
    monthlyPriceFcfa: 0,
    includedDistributions: 25,
    isLifetimeQuota: true,
    periods: {
      '1m': { totalFcfa: 0, monthlyEquivalentFcfa: 0 },
      '6m': { totalFcfa: 0, monthlyEquivalentFcfa: 0 },
      '12m': { totalFcfa: 0, monthlyEquivalentFcfa: 0 },
    },
    features: [
      'Création et hébergement de campagnes',
      'Accès à la galerie publique',
      'Éditeur photo + détourage & filtres',
      'Aperçu en direct',
      'Partage sur WhatsApp & réseaux',
      '25 exports inclus à vie (filigranés)',
      'Achat de packs de distribution permanent',
    ],
    ctaText: 'Commencer gratuitement',
  },
  creator: {
    id: 'creator',
    name: 'Créateur',
    tagline: 'Pour graphistes, agences, créateurs et organisateurs d’événements.',
    monthlyPriceFcfa: 3000,
    includedDistributions: 100,
    costPerParticipantFcfa: 30,
    costPerParticipantLabel: '100 distributions incluses — soit 30 FCFA par participant',
    periods: {
      '1m': {
        totalFcfa: 3000,
        monthlyEquivalentFcfa: 3000,
      },
      '6m': {
        totalFcfa: 15000,
        strikethroughTotalFcfa: 18000,
        monthlyEquivalentFcfa: 2500,
        savingsLabel: '1 mois offert',
        discountPercent: 16.7,
      },
      '12m': {
        totalFcfa: 27000,
        strikethroughTotalFcfa: 36000,
        monthlyEquivalentFcfa: 2250,
        savingsLabel: '3 mois offerts',
        discountPercent: 25,
      },
    },
    features: [
      '100 distributions incluses / mois (sans filigrane)',
      'Exports sans filigrane Campagnes',
      'Cadres avancés & calques multiples (Frame Pro)',
      'Bibliothèque de modèles prêts à l’emploi',
      'Statistiques de participation de base',
      'Gestion et personnalisation des liens de campagne',
      'Animation IA et formats d’affichage',
    ],
    ctaText: 'Choisir Créateur',
  },
  organization: {
    id: 'organization',
    name: 'Organisations & ONG',
    tagline: 'Pour ONG, associations, institutions, marques et campagnes à fort impact.',
    monthlyPriceFcfa: 5000,
    includedDistributions: 1000,
    costPerParticipantFcfa: 5,
    costPerParticipantLabel: '1 000 distributions incluses — soit 5 FCFA par participant',
    highlight: true,
    highlightLabel: 'Offre recommandée',
    periods: {
      '1m': {
        totalFcfa: 5000,
        monthlyEquivalentFcfa: 5000,
      },
      '6m': {
        totalFcfa: 25000,
        strikethroughTotalFcfa: 30000,
        monthlyEquivalentFcfa: 4167,
        savingsLabel: '1 mois offert',
        discountPercent: 16.7,
      },
      '12m': {
        totalFcfa: 45000,
        strikethroughTotalFcfa: 60000,
        monthlyEquivalentFcfa: 3750,
        savingsLabel: '3 mois offerts',
        discountPercent: 25,
      },
    },
    features: [
      '1 000 distributions incluses / mois (sans filigrane)',
      'Coût imbattable : 5 FCFA par participant',
      'Toutes les fonctionnalités Créateur incluses',
      'Gestion multi-campagnes en simultané',
      'Statistiques avancées & suivi de diffusion',
      'Export haute définition sans perte',
      'Support prioritaire dédié',
    ],
    ctaText: 'Choisir Organisations & ONG',
  },
};

/**
 * 2. Packs de crédits de participation (distribution).
 * Les crédits achetés n'expirent JAMAIS et sont cumulables.
 */
export interface DistributionPack {
  id: string;
  name: string;
  distributions: number | null;
  priceFcfa: number | null;
  unitPriceFcfa: number | null;
  tagline: string;
  highlight?: boolean;
}

export const DISTRIBUTION_PACKS: DistributionPack[] = [
  {
    id: 'pack_100',
    name: '100 distributions',
    distributions: 100,
    priceFcfa: 2500,
    unitPriceFcfa: 25,
    tagline: 'Campagne de club, classe ou cercle restreint.',
  },
  {
    id: 'pack_500',
    name: '500 distributions',
    distributions: 500,
    priceFcfa: 5000,
    unitPriceFcfa: 10,
    tagline: 'Événement d’école, journée d’action locale.',
    highlight: true,
  },
  {
    id: 'pack_1000',
    name: '1 000 distributions',
    distributions: 1000,
    priceFcfa: 7500,
    unitPriceFcfa: 7.5,
    tagline: 'Campus, rassemblement régional, mobilisation.',
  },
  {
    id: 'pack_5000',
    name: '5 000 distributions',
    distributions: 5000,
    priceFcfa: 20000,
    unitPriceFcfa: 4,
    tagline: 'Campagne nationale multi-villes d’envergure.',
  },
  {
    id: 'pack_custom',
    name: '10 000 et plus',
    distributions: null,
    priceFcfa: null,
    unitPriceFcfa: null,
    tagline: 'Grands comptes et institutions, conditions sur-mesure.',
  },
];

/**
 * 3. Suppléments optionnels pour les packs de distribution
 */
export const PACK_ADDONS = {
  propre: {
    name: 'Pack Propre',
    description: 'Le filigrane Campagnes est retiré pour tous les participants.',
    pricing: [
      { volume: 100, extraFcfa: 1000 },
      { volume: 500, extraFcfa: 2500 },
      { volume: 1000, extraFcfa: 4000 },
      { volume: 5000, extraFcfa: 15000 },
    ],
  },
  sponsor: {
    name: 'Pack Sponsor',
    description: 'Le filigrane est remplacé par le logo de votre marque / sponsor officiel.',
    minFloorFcfa: 50000,
    pricing: [
      { volume: 100, extraFcfa: 2000 },
      { volume: 500, extraFcfa: 5000 },
      { volume: 1000, extraFcfa: 8000 },
      { volume: 5000, extraFcfa: 30000 },
    ],
  },
};

/**
 * 4. Micro-paiement participant (retrait de filigrane à l'unité)
 */
export const PARTICIPANT_PAYMENT = {
  priceFcfa: 500,
  durationHours: 24,
  label: '500 FCFA / 24 h',
  description: 'Retrait du filigrane sans création de compte, réglé par Mobile Money.',
};

/**
 * Contact commercial pour le palier Entreprise (sur devis)
 */
export const ENTERPRISE_CONTACT = {
  email: 'bonjour@campagnes.app',
  subject: 'Demande de devis Entreprise / Institution',
  body: 'Bonjour,\n\nNous souhaitons déployer Campagnes pour notre organisation.\n\nNom de l’organisation :\nNombre de participants estimés :\nBesoins spécifiques (domaine, SSO, intégrations) :\n\nMerci !',
};

/**
 * Fonctions de formatage normalisées
 */
export function formatFcfaPrice(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(amount).replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}

export function getPlanPeriodPrice(
  planId: 'free' | 'creator' | 'organization',
  duration: BillingDuration = '1m',
): PlanPricingPeriod {
  const plan = PRICING_PLANS[planId];
  return plan.periods[duration] || plan.periods['1m'];
}
