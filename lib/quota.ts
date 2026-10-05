import type { CampaignQuota, ParticipationClaim } from './types';
import { DISTRIBUTION_PACKS, type DistributionPack } from './pricing/config';

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
 * Les volumes et les prix **viennent de la grille unique** (`DISTRIBUTION_PACKS`,
 * `lib/pricing/config.ts`). Ce module ne fait que les réinterpréter pour son
 * propre besoin : un palier, c'est un nombre de téléchargements vendu à un prix,
 * avec un intitulé court.
 *
 * Règle N3 : aucun montant n'est recopié ici. Ajouter un palier dans la config
 * suffit ; il apparaît dans le tunnel d'extension sans autre modification.
 */
export interface TopupTier {
  /** Téléchargements ajoutés au quota courant. */
  downloads: number;
  /** Prix en FCFA. */
  priceFcfa: number;
  /** Intitulé court affiché sur le bouton. */
  label: string;
}

/**
 * Un palier n'est proposé au paiement que s'il a **un identifiant de pack, un
 * volume et un prix** publiés. Le pack « 10 000 et plus » (sur devis) n'entre
 * donc pas dans l'échelle : il ne se règle pas en ligne.
 */
export const TOPUP_TIERS: TopupTier[] = DISTRIBUTION_PACKS.filter(
  (pack): pack is DistributionPack & { distributions: number; priceFcfa: number } =>
    pack.distributions !== null && pack.priceFcfa !== null,
).map((pack) => ({
  downloads: pack.distributions,
  priceFcfa: pack.priceFcfa,
  label: pack.name,
}));

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

/**
 * Message quand un LIEN PRIVÉ refuse un accès.
 *
 * Volontairement muet sur la cause. Un jeton est un secret : annoncer « ce lien
 * n'existe pas » ou « il est révoqué » confirmerait son existence à quelqu'un
 * qui ne devrait rien savoir. La fonction SQL rend d'ailleurs toutes ces causes
 * indiscernables — l'écran n'a pas à les distinguer, et ne le peut pas.
 *
 * Il ne dit pas non plus « votre lien est expiré » : le participant n'a pas
 * commandé ce lien, il l'a reçu. La seule chose utile à lui dire, c'est
 * qu'il doit se rapprocher de qui le lui a envoyé.
 */
export function privateLinkBlockedMessage(): string {
  return "Ce lien a atteint sa limite d'utilisations. Contactez la personne qui vous l'a envoyé.";
}

/** Adresse de contact commerciale — devis au-delà de la grille des paliers. */
export const QUOTA_CONTACT_EMAIL = 'bonjour@campagnes.app';

/**
 * Demande de devis, pré-remplie — pour ce qui sort de l'échelle des paliers.
 *
 * L'extension **dans la grille** passe désormais par un paiement Mobile Money en
 * ligne (`TopupButton` → `DISTRIBUTION_PACKS`). Le revirement est assumé : tant
 * qu'aucun prestataire n'était branché, un bouton « payer » qui ne débitait rien
 * aurait été un mensonge ; maintenant que le paiement Mobile Money répond, c'est
 * le `mailto:` qui le serait.
 *
 * Ce helper ne survit donc que pour le **sur devis** : au-dessus de
 * `QUOTE_THRESHOLD`, ou pour un pack dont le prix n'est pas publié
 * (`pack_custom`, 10 000 et plus). Là, un contact humain est la seule voie
 * honnête.
 */
export function topupQuoteHref(params: {
  campaignName: string;
  campaignSlug: string;
  used: number;
  quota: number;
}): string {
  const { campaignName, campaignSlug, used, quota } = params;
  const rest = remaining(used, quota);

  const subject = `Extension de campagne sur devis — ${campaignName}`;

  const lines = [
    'Bonjour,',
    '',
    `La campagne « ${campaignName} » (${campaignSlug}) dépasse le volume de la grille : ${used} téléchargements, ${rest} restant.`,
    '',
    'Volume souhaité : ________ téléchargements.',
    '',
    "Nom de l'organisation : ",
    'Lien de la campagne : ',
    '',
  ];

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
