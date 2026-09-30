import type { CampaignQuota, ParticipationClaim } from './types';

/**
 * Quota de téléchargements par campagne.
 *
 * Une campagne ouvre avec **10 téléchargements offerts**. Au-delà, le lien se
 * bloque et le créateur doit demander une extension.
 *
 * Ce qui est compté : le **téléchargement** du visuel, et rien d'autre. Un
 * partage est impossible à mesurer — le participant peut copier le lien à la
 * main sans que la plateforme le sache. Le téléchargement est un engagement
 * réel, et le seul instant observable du parcours participant.
 *
 * Ce que ce comptage n'est pas : une protection. La photo du participant n'est
 * jamais envoyée, tout le rendu se fait dans son navigateur. Une personne
 * avertie peut écrire en base sans passer par l'interface. C'est un frein
 * commercial, et le projet ne prétend jamais le contraire.
 */

/** Téléchargements offerts à la création d'une campagne. */
export const FREE_DOWNLOADS = 10;

/**
 * Au-delà de ce volume cumulé, la campagne relève du sur devis.
 *
 * La grille s'arrête à 5 000 téléchargements : au-delà, c'est du cas par cas.
 * C'est aussi le palier le plus fréquent — une campagne nationale — donc celui
 * qui doit le plus nettement passer par un contact.
 */
export const QUOTE_THRESHOLD = 10_000;

/**
 * Paliers d'extension.
 *
 * Ils reprennent exactement la grille `distribution_offers` : mêmes volumes,
 * mêmes prix. Un créateur qui a lu la page tarifs reconnaît ses chiffres, et il
 * n'y a pas deux grilles concurrentes à tenir à jour.
 */
export interface TopupTier {
  /** Téléchargements ajoutés au quota courant. */
  downloads: number;
  /** Prix en FCFA. */
  priceFcfa: number;
  /** Intitulé court affiché sur le bouton. */
  label: string;
}

export const TOPUP_TIERS: TopupTier[] = [
  { downloads: 100, priceFcfa: 2500, label: 'Starter' },
  { downloads: 500, priceFcfa: 5000, label: 'Popular' },
  { downloads: 1000, priceFcfa: 7500, label: 'Growth' },
  { downloads: 5000, priceFcfa: 20000, label: 'Large' },
];

/**
 * Premier palier : 100 pour 2 500 FCFA.
 *
 * C'est le palier proposé par défaut au créateur dont le lien vient de se
 * bloquer. Le reste de la grille est proposé plus bas, pour qu'un créateur qui
 * vise large ne soit pas obligé de conclure deux fois.
 */
export const DEFAULT_TIER = TOPUP_TIERS[0];

export function tierByDownloads(downloads: number): TopupTier | null {
  return TOPUP_TIERS.find((t) => t.downloads === downloads) ?? null;
}

/** Prix par téléchargement, pour comparer les paliers honnêtement. */
export function pricePerDownload(tier: TopupTier): number {
  return Math.round((tier.priceFcfa / tier.downloads) * 10) / 10;
}

/** Downloads restants, jamais négatif. */
export function remaining(used: number, quota: number): number {
  return Math.max(0, quota - used);
}

/** Un téléchargement sur trois : on prévient avant que la limite ne tonne. */
export const WARN_RATIO = 2 / 3;

/**
 * Faut-il inciter à l'extension ?
 *
 * L'avertissement commence bien avant la limite : demander de l'argent à
 * quelqu'un dont la campagne vient de réussir est difficile, il faut donc
 * prévenir pendant qu'il peut encore décider en connaissance de cause.
 */
export function shouldInviteToTopup(used: number, quota: number): boolean {
  const rest = remaining(used, quota);
  if (rest === 0) return true;
  return rest <= Math.max(1, Math.floor(quota * WARN_RATIO));
}

/** Message du participant quand le quota est atteint. */
export function blockedMessage(campaignName: string): string {
  return (
    `La campagne « ${campaignName} » a atteint ses ${FREE_DOWNLOADS} téléchargements offerts. ` +
    `Son créateur peut la prolonger — revenez plus tard, ou partagez ce lien avec lui.`
  );
}

/** Adresse de contact pour l'extension. */
export const QUOTA_CONTACT_EMAIL = 'bonjour@campagnes.app';

/**
 * Demande d'extension, pré-remplie.
 *
 * Même mécanisme que `quoteHref()` dans `lib/distribution.ts` : tant qu'aucun
 * prestataire de paiement n'est branché, l'extension s'obtient par un contact.
 * Un bouton « payer » qui ne débite rien serait un mensonge.
 *
 * `tier` est optionnel : sans lui, la demande reste ouverte et le volume est
 * proposé au devis. Avec lui, le volume et le prix sont annoncés, ce qui évite
 * un aller-retour de correspondance.
 */
export function topupHref(params: {
  campaignName: string;
  campaignSlug: string;
  used: number;
  quota: number;
  tier?: TopupTier;
}): string {
  const { campaignName, campaignSlug, used, quota, tier } = params;
  const rest = remaining(used, quota);

  // La campagne sort-elle de l'échelle affichable ? Le message change alors de
  // nature : ce n'est plus un palier, c'est un devis.
  const beyondQuote = quota >= QUOTE_THRESHOLD;

  const subject = beyondQuote
    ? `Extension de campagne sur devis — ${campaignName}`
    : `Extension de campagne — ${campaignName}`;

  const lines = [
    'Bonjour,',
    '',
    beyondQuote
      ? `La campagne « ${campaignName} » (${campaignSlug}) dépasse le volume de la grille : ${used} téléchargements, ${rest} restant.`
      : `La campagne « ${campaignName} » (${campaignSlug}) a atteint son quota : ${used} téléchargements sur ${quota}.`,
    '',
  ];

  if (tier) {
    lines.push(
      `Je souhaite la prolonger de ${tier.downloads} téléchargements (${formatFcfaTier(tier.priceFcfa)}).`,
    );
  } else {
    lines.push(
      'Volume souhaité : ________ téléchargements (100 pour 2 500 FCFA, 500 pour 5 000, 1 000 pour 7 500, 5 000 pour 20 000).',
    );
  }

  lines.push("Nom de l'organisation : ", 'Lien de la campagne : ', '');

  return `mailto:${QUOTA_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

/** `2500` → `« 2 500 FCFA »`, convention française (espace insécable fine). */
export function formatFcfaTier(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(amount).replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}

/** Normalise l'état lu en base vers le type partagé par les écrans. */
export function toQuota(used: number, quota: number): CampaignQuota {
  return { used, quota, open: used < quota };
}

/** Normalise le retour de la fonction de réservation. */
export function toClaim(row: unknown): ParticipationClaim {
  const r = (row ?? {}) as Record<string, unknown>;
  const first = Array.isArray(row) ? (row[0] ?? {}) : r;

  return {
    granted: Boolean(first.granted ?? first.claim_granted),
    used: Number(first.used ?? first.claim_used ?? 0),
    quota: Number(first.quota ?? first.claim_quota ?? FREE_DOWNLOADS),
  };
}
