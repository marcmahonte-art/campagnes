/**
 * Source unique de vérité pour la tarification Campagnes.
 *
 * Devise : FCFA (XOF) · Marché : Afrique de l'Ouest (zone XOF facturable ;
 * les autres corridors sont listés dans `lib/payments/corridors.ts`, jamais
 * facturés tant qu'une grille n'existe pas dans leur devise).
 * Conforme à : `docs/monétisation/ui/grille-tarifaire.md`
 *
 * Règle N3 : Aucun montant ne doit exister en dur dans un composant.
 * Règle N5 : Aucune fonctionnalité non développée n'est affichée comme disponible.
 *
 * Les listes `features` ci-dessous ont été passées au crible de N5 (phase U1) :
 * chaque ligne renvoie à du code réellement livré. Ce qui n'existe pas encore
 * (domaine personnalisé, galerie privée, rapports PDF, multi-utilisateurs,
 * export haute définition, support prioritaire) n'apparaît QUE dans le bloc
 * « Sur devis » de la page, jamais dans une carte.
 */

import {
  DEFAULT_PAYMENT_COUNTRY,
  findCorridor,
  payableCorridors,
  payableCountriesLabel,
  payableOperatorLabels,
} from '../payments/corridors';

export type BillingDuration = '1m' | '6m' | '12m';

export interface PlanPricingPeriod {
  /** Montant total prépayé pour la période en FCFA. */
  totalFcfa: number;
  /** Total au prorata mensuel simple (mensuel × mois) — le prix barré. */
  strikethroughTotalFcfa?: number;
  /** Équivalent mensuel, affiché en petit sous le total. */
  monthlyEquivalentFcfa: number;
  /** Argument commercial (ex: « 1 mois offert »), jamais un pourcentage. */
  savingsLabel?: string;
  /**
   * Réduction en pourcentage, **plafonnée à 25 %** par la grille.
   * Valeur informative : l'interface n'affiche JAMAIS ce pourcentage
   * (les acheteurs sont des ONG qui doivent justifier la dépense ligne à ligne).
   */
  discountPercent?: number;
}

export interface PricingPlanConfig {
  id: 'free' | 'creator' | 'organization';
  name: string;
  tagline: string;
  monthlyPriceFcfa: number;
  /** Distributions incluses par mois. */
  includedDistributions: number;
  /** Le quota gratuit est à vie, pas mensuel. */
  isLifetimeQuota?: boolean;
  /** « 100 distributions incluses par mois » / « 25 exports à vie ». */
  quotaLabel: string;
  /** Coût par participant inclus — l'argument le plus fort de la page. */
  costPerParticipantFcfa?: number;
  /** « soit 30 FCFA par participant ». */
  costPerParticipantLabel?: string;
  /** Prérequis de l'export sans filigrane, pour la matrice. */
  watermarkLabel: string;
  periods: Record<BillingDuration, PlanPricingPeriod>;
  /** Uniquement des fonctionnalités développées (N5). */
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
  { id: '12m', label: '12 mois', months: 12, badge: '3 mois offerts' },
];

export const PRICING_PLANS: Record<'free' | 'creator' | 'organization', PricingPlanConfig> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    tagline: 'Pour tester et lancer ses premières campagnes, sans frais.',
    monthlyPriceFcfa: 0,
    includedDistributions: 25,
    isLifetimeQuota: true,
    quotaLabel: '25 exports à vie',
    watermarkLabel: 'Filigrane Campagnes',
    periods: {
      '1m': { totalFcfa: 0, monthlyEquivalentFcfa: 0 },
      '6m': { totalFcfa: 0, monthlyEquivalentFcfa: 0 },
      '12m': { totalFcfa: 0, monthlyEquivalentFcfa: 0 },
    },
    features: [
      'Création de campagnes et hébergement',
      'Accès à la galerie publique',
      'Éditeur photo + arrière-plan',
      'Prévisualisation avant publication',
      'Partage WhatsApp et réseaux',
      'Achat de crédits de distribution',
    ],
    ctaText: 'Commencer gratuitement',
  },
  creator: {
    id: 'creator',
    name: 'Créateur',
    tagline: 'Pour les indépendants, les agences et les créateurs.',
    monthlyPriceFcfa: 3000,
    includedDistributions: 100,
    quotaLabel: '100 distributions incluses par mois',
    costPerParticipantFcfa: 30,
    costPerParticipantLabel: 'soit 30 FCFA par participant',
    watermarkLabel: 'Sans filigrane — tant que le quota n’est pas épuisé',
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
      'Exports sans filigrane Campagnes',
      'Cadres avancés et calques multiples (Frame Pro)',
      'Bibliothèque de modèles prêts à l’emploi',
      'Animation des cadres assistée par l’IA',
      'Statistiques de participation',
    ],
    ctaText: 'Payer avec Mobile Money',
  },
  organization: {
    id: 'organization',
    name: 'Organisations & ONG',
    tagline: 'Pour les ONG, associations, institutions et marques.',
    monthlyPriceFcfa: 5000,
    includedDistributions: 1000,
    quotaLabel: '1 000 distributions incluses par mois',
    costPerParticipantFcfa: 5,
    costPerParticipantLabel: 'soit 5 FCFA par participant',
    watermarkLabel: 'Sans filigrane — tant que le quota n’est pas épuisé',
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
      'Exports sans filigrane Campagnes',
      'Cadres avancés et calques multiples (Frame Pro)',
      'Bibliothèque de modèles prêts à l’emploi',
      'Animation des cadres assistée par l’IA',
      'Statistiques de participation',
    ],
    ctaText: 'Payer avec Mobile Money',
  },
};

/**
 * 2. Crédits de participation (distribution).
 *
 * Les crédits achetés **n'expirent jamais** et se reportent d'une campagne à
 * l'autre ; le quota inclus, lui, est mensuel. C'est la seule différence entre
 * les deux, et elle suffit à rendre les crédits rationnels face à l'abonnement.
 *
 * Les durées 1 / 6 / 12 mois ne s'appliquent pas ici : abonnements uniquement.
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
    tagline: 'Campagne de club, de classe ou de cercle restreint.',
  },
  {
    id: 'pack_500',
    name: '500 distributions',
    distributions: 500,
    priceFcfa: 5000,
    unitPriceFcfa: 10,
    tagline: 'Journée d’action locale, événement d’école.',
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
    tagline: 'Campagne nationale, plusieurs villes.',
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

/** Palier au-delà duquel le volume sort de la grille : devis obligatoire. */
export const DISTRIBUTION_QUOTE_THRESHOLD = 10000;

/** Extrêmes de la grille, pour la phrase « de 25 à 4 FCFA par participant ». */
export const DISTRIBUTION_UNIT_PRICE_RANGE = { minFcfa: 25, maxFcfa: 4 };

/**
 * Bandeau distribution de la page tarifs.
 *
 * Les paliers **ne sont pas des cartes** sur cette page : affichés côte à côte
 * avec l'offre ONG, ils se font cannibaliser (l'abonnement ONG revient moins cher
 * à l'unité que le pack de taille équivalente — grille §7). La grille se replie
 * donc dans un `<details>` et l'achat se fait dans le tunnel, après le choix
 * d'une campagne.
 */
export const DISTRIBUTION_BANNER = {
  title: 'La distribution se paie à l’usage.',
  /** Phrase unique : le partage est gratuit, seules les participations comptent. */
  body:
    'Le partage du lien est gratuit. Vous ne payez que les participations réellement ' +
    'exportées — de 25 à 4 FCFA par participant selon le volume.',
  /** La règle qui rend les crédits rationnels face à l'abonnement. */
  rule:
    'Les crédits achetés n’expirent jamais et se reportent d’une campagne à l’autre. ' +
    'Le quota inclus, lui, est mensuel.',
  gridLabel: 'Voir la grille des crédits',
  ctaText: 'Acheter des crédits',
  /** Une participation = un export réussi. */
  unit: 'Une utilisation = un export réussi.',
};

/**
 * 3. Suppléments au pack — vendus au checkout du pack, jamais par e-mail.
 *
 * Inutiles pour un compte Créateur ou ONG à jour : l'absence de filigrane y est
 * déjà incluse. Ils s'adressent aux comptes Gratuit qui achètent un pack.
 */
export const PACK_ADDONS = {
  propre: {
    name: 'Pack Propre',
    description: 'Le filigrane est retiré pour tous les participants de la campagne.',
    pricing: [
      { volume: 100, extraFcfa: 1000 },
      { volume: 500, extraFcfa: 2500 },
      { volume: 1000, extraFcfa: 4000 },
      { volume: 5000, extraFcfa: 15000 },
    ],
  },
  sponsor: {
    name: 'Pack Sponsor',
    description: 'Le filigrane est remplacé par le logo de votre marque.',
    minFloorFcfa: 50000,
    pricing: [
      { volume: 100, extraFcfa: 2000 },
      { volume: 500, extraFcfa: 5000 },
      { volume: 1000, extraFcfa: 8000 },
      { volume: 5000, extraFcfa: 30000 },
    ],
  },
};

/** 4. Micro-paiement participant : retrait du filigrane, sans création de compte. */
export const PARTICIPANT_PAYMENT = {
  priceFcfa: 500,
  durationHours: 24,
  label: '500 FCFA / 24 h',
  description: 'Retrait du filigrane sans création de compte, réglé par Mobile Money.',
};

/**
 * 5. Palier entreprise — **sur devis, jamais avec un prix**.
 *
 * Il n'y a pas de 4ᵉ offre publiée. Ces fonctions ne sont pas développées :
 * les annoncer comme des avantages payants serait un mensonge (N5). Elles sont
 * vendues en direct, et c'est ce qui permet de retirer un 4ᵉ prix de la page
 * sans perdre les prospects institutionnels.
 */
export const ENTERPRISE_CONTACT = {
  email: 'bonjour@campagnes.app',
  subject: 'Demande de devis Entreprise / Institution',
  body:
    'Bonjour,\n\nNous souhaitons déployer Campagnes pour notre organisation.\n\n' +
    'Nom de l’organisation :\nNombre de participants estimés :\n' +
    'Besoins spécifiques (domaine, SSO, intégrations) :\n\nMerci !',
  responseDelay: 'Réponse sous 48 heures ouvrées',
  /** Fonctions enterprise vendues sur devis — hors grille, hors prix. */
  features: [
    'Domaine personnalisé',
    'Galerie privée',
    'Rapports PDF',
    'Multi-utilisateurs',
  ],
  /** Phrase d'accroche du bloc, sans montant. */
  lead: 'Un volume qui ne figure pas dans la grille, ou un cahier des charges spécifique ?',
  ctaText: 'Nous contacter',
};

/**
 * 6. Réassurance — formulation exacte.
 *
 * La grille est une **prépaiement sans reconduction automatique** (N12). Le
 * texte est écrit une fois ici pour qu'aucune surface ne puisse inventer une
 * promesse de prélèvement récurrent.
 */
export const PREPAYMENT_REASSURANCE = {
  lead: 'Prépaiement sans reconduction automatique.',
  body: 'Vos droits restent actifs jusqu’à la date d’échéance affichée sur votre facturation. Vous recevrez un rappel 7 jours avant.',
  renewal: 'Le renouvellement vous est proposé 7 jours avant l’échéance, jamais automatiquement.',
};

/**
 * 7. Moyens de paiement — libellés utilisateur (N10, N11).
 *
 * Le nom de la passerelle n'apparaît jamais dans l'interface : ces deux phrases
 * sont les seules qui doivent être affichées.
 */
const PAYABLE_OPERATORS = payableOperatorLabels();
const PAYABLE_COUNTRIES = payableCountriesLabel();
const REFERENCE_CORRIDOR = findCorridor(DEFAULT_PAYMENT_COUNTRY) ?? payableCorridors()[0] ?? null;

export const PAYMENT_METHOD_LABELS = {
  underCta: `Paiement par Mobile Money (${PAYABLE_OPERATORS.join(', ')}) · sans carte bancaire`,
  reassurance: `Paiement par Mobile Money (${PAYABLE_OPERATORS.join(', ')}), sans carte bancaire. Disponible en : ${PAYABLE_COUNTRIES}.`,
  operators: PAYABLE_OPERATORS,
  countries: PAYABLE_COUNTRIES,
  countryCode: REFERENCE_CORRIDOR?.countryCode ?? 'À COMPLÉTER',
  currency: REFERENCE_CORRIDOR?.currency ?? 'À COMPLÉTER',
  dialCode: REFERENCE_CORRIDOR?.dialCode ?? 'À COMPLÉTER',
  /** XOF : aucune décimale supportée par la passerelle. */
  decimalsSupported: REFERENCE_CORRIDOR?.decimalsSupported ?? false,
};

/* ------------------------------------------------------------------ */
/* Formatage (règle §7 : Intl, jamais un formatage maison)             */
/* ------------------------------------------------------------------ */

/**
 * « 3 000 FCFA ».
 *
 * `Intl.NumberFormat('fr-FR')` sépare déjà les milliers par une **espace fine
 * insécable** (U+202F). On ne la remplace surtout pas par une espace ordinaire :
 * c'est ce qui empêche « 3 000 FCFA » de se couper en fin de ligne sur un
 * téléphone étroit.
 */
export function formatFcfaPrice(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`;
}

/** « 7,5 » — coût unitaire, qui peut être décimal même si le prix ne l'est pas. */
export function formatUnitPrice(unitFcfa: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(unitFcfa);
}

export function getPlanPeriodPrice(
  planId: 'free' | 'creator' | 'organization',
  duration: BillingDuration = '1m',
): PlanPricingPeriod {
  const plan = PRICING_PLANS[planId];
  return plan.periods[duration] || plan.periods['1m'];
}

/** Nombre de mois d'une période — sert à vérifier le prorata des prix barrés. */
export function getPeriodMonths(duration: BillingDuration): number {
  return PRICING_PERIODS.find((p) => p.id === duration)?.months ?? 1;
}