import { formatFcfa } from './plans';

/**
 * Distribution à la demande.
 *
 * Principe : **1 participant = 1 crédit**.
 * Les crédits sont attachés au compte, pas à la campagne. Une campagne reçoit un
 * budget de distribution ; chaque participation réellement aboutie décrémente le solde.
 *
 * Ce qui n'est PAS facturé : le partage du lien. Un lien partagé à 10 000 personnes
 * dont 1 000 participent consomme 1 000 crédits, pas 10 000 (§7 du document).
 */

export interface CreditPack {
  id: string;
  name: string;
  /** `null` = volume sur devis. */
  participants: number | null;
  /** `null` = prix sur devis. */
  priceFcfa: number | null;
  description: string;
  highlight?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'test',
    name: 'Test',
    participants: 20,
    priceFcfa: 0,
    description: 'Inclus dans le plan Free, pour essayer la diffusion de bout en bout.',
  },
  {
    id: 'starter',
    name: 'Starter',
    participants: 100,
    priceFcfa: 2500,
    description: 'Une campagne locale, une classe, un club.',
  },
  {
    id: 'popular',
    name: 'Popular',
    participants: 500,
    priceFcfa: 5000,
    description: 'Une campagne d’école, une journée internationale.',
    highlight: true,
  },
  {
    id: 'growth',
    name: 'Growth',
    participants: 1000,
    priceFcfa: 7500,
    description: 'Une campagne de campus ou d’événement régional.',
  },
  {
    id: 'large',
    name: 'Large',
    participants: 5000,
    priceFcfa: 20000,
    description: 'Une campagne nationale, plusieurs villes.',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    participants: null,
    priceFcfa: null,
    description: 'Au-delà de 10 000 participants, conditions adaptées.',
  },
];

export const PACKS_BY_ID: Record<string, CreditPack> = Object.fromEntries(
  CREDIT_PACKS.map((p) => [p.id, p]),
);

/** Quota de participations offert au plan Free (§3 : « distribution gratuite de test, limitée »). */
export const FREE_TEST_QUOTA = 20;

/**
 * Prix indicatif par participant. Diminue avec le volume — c'est ce qui encourage
 * les grosses campagnes à acheter des lots plus importants.
 */
export function pricePerParticipant(pack: CreditPack): number | null {
  if (!pack.participants || pack.priceFcfa === null) return null;
  return pack.priceFcfa / pack.participants;
}

/** `7.5` → `« 7,5 FCFA »` ; `25` → `« 25 FCFA »`. */
export function formatPricePerParticipant(pack: CreditPack): string {
  const value = pricePerParticipant(pack);
  if (value === null) return 'Sur devis';
  if (value === 0) return 'Gratuit';
  const rounded = Math.round(value * 10) / 10;
  const text = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(rounded);
  return `${text} FCFA / participant`;
}

export function formatPackPrice(pack: CreditPack): string {
  if (pack.priceFcfa === null) return 'Sur devis';
  if (pack.priceFcfa === 0) return 'Gratuit';
  return formatFcfa(pack.priceFcfa);
}

export function formatPackVolume(pack: CreditPack): string {
  if (pack.participants === null) return '10 000+';
  return new Intl.NumberFormat('fr-FR').format(pack.participants);
}

/** Reste-t-il assez de crédits pour honorer le budget d'une campagne ? */
export function canCover(balance: number, budget: number): boolean {
  return balance >= budget;
}

/** Pourcentage consommé d'un budget de distribution, borné à 100. */
export function consumedRatio(consumed: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(100, Math.round((consumed / budget) * 100));
}
