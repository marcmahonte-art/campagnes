/**
 * Distribution — grille tarifaire.
 *
 * La diffusion se facture **par volume**. Les paliers publiés (100 → 5 000) se
 * règlent désormais en ligne par Mobile Money (`TopupButton` → pawaPay) ; ce qui
 * sort de la grille — 10 000 et plus — reste **sur devis** (`quoteHref()`).
 *
 * Pas de solde, pas de crédit prépayé transférable : ce qui est acheté est
 * immédiatement rattaché à une campagne (`credit_campaign_quota`, migration
 * 0018). Un paiement ne dort jamais dans un porte-monnaie.
 *
 * Ce que la grille ne couvre PAS : le décompte. Une campagne ouvre avec un
 * quota de téléchargements, et c'est le produit qui le consomme — voir
 * `lib/quota.ts` et la migration 0007. Les deux mécanismes sont distincts et
 * complémentaires :
 *
 *   - ici, le **prix** d'un volume (ce qu'une campagne coûte à étendre)
 *   - là-bas, le **compteur** d'une campagne (ce qu'elle a déjà consommé)
 *
 * Ce qui n'est PAS facturé : l'ouverture du lien. Un lien ouvert par 10 000
 * personnes ne coûte rien tant que personne ne télécharge pas de visuel. Seule
 * la participation compte, parce qu'elle est la seule chose mesurable.
 */

export interface DistributionOffer {
  id: string;
  name: string;
  /** Volume de participations. `null` = au-delà de la grille, sur devis. */
  participants: number | null;
  /** Prix en FCFA. `null` = sur devis. */
  priceFcfa: number | null;
  description: string;
  /** Mise en avant visuelle. */
  highlight?: boolean;
}

export const DISTRIBUTION_OFFERS: DistributionOffer[] = [
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
    name: 'Grand volume',
    participants: null,
    priceFcfa: null,
    description: 'Au-delà de 10 000 participants, conditions adaptées.',
  },
];

/** Adresse de contact pour établir un devis de distribution. */
export const DISTRIBUTION_CONTACT_EMAIL = 'bonjour@campagnes.app';

/** Lien de demande de devis, pré-rempli avec le volume visé. */
export function quoteHref(offer?: DistributionOffer): string {
  const subject = offer
    ? `Devis distribution — ${formatOfferVolume(offer)} participants`
    : 'Devis distribution';
  const body = offer
    ? `Bonjour,\n\nJe souhaite diffuser une campagne auprès de ${formatOfferVolume(offer)} participants.\n\n`
    : 'Bonjour,\n\nJe souhaite diffuser une campagne.\n\n';
  return `mailto:${DISTRIBUTION_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Prix indicatif par participant. Diminue avec le volume — c'est ce qui rend la
 * grille lisible d'un coup d'œil.
 */
export function pricePerParticipant(offer: DistributionOffer): number | null {
  if (!offer.participants || offer.priceFcfa === null) return null;
  return offer.priceFcfa / offer.participants;
}

/** `7.5` → `« 7,5 FCFA »` ; `25` → `« 25 FCFA »`. */
export function formatPricePerParticipant(offer: DistributionOffer): string {
  const value = pricePerParticipant(offer);
  if (value === null) return 'Sur devis';
  const rounded = Math.round(value * 10) / 10;
  const text = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(rounded);
  return `${text} FCFA / participant`;
}

export function formatOfferPrice(offer: DistributionOffer): string {
  if (offer.priceFcfa === null) return 'Sur devis';
  return `${new Intl.NumberFormat('fr-FR').format(offer.priceFcfa).replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}

export function formatOfferVolume(offer: DistributionOffer): string {
  if (offer.participants === null) return '10 000+';
  return new Intl.NumberFormat('fr-FR').format(offer.participants);
}
