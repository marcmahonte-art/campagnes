import type { Campaign } from './types';
import { SITE_URL } from '@/lib/backend/config';

/**
 * Texte de partage, hashtags et liens de plateforme — source unique.
 *
 * Deux règles gouvernent ce module :
 *
 * 1. **On ne partage jamais un lien privé.** Le partage social ne connaît que
 *    `/c/:slug`, l'adresse publique. Un jeton `/d/:token` est confidentiel : le
 *    laisser fuiter dans un message WhatsApp viderait de son sens tout le
 *    mécanisme de distribution privée.
 * 2. **On ne fait pas semblant.** TikTok n'expose aucun partage web par lien :
 *    on ne construit donc pas d'URL de publication TikTok. On propose le
 *    parcours réel — télécharger, copier, ouvrir l'application.
 */

/** Le hashtag de la marque : toujours présent, jamais dupliqué. */
export const BRAND_HASHTAG = '#Campagnes';

/** Au-delà de cinq, un texte de partage se lit comme du remplissage. */
export const MAX_HASHTAGS = 5;

/**
 * Hashtags que le créateur définit lui-même.
 *
 * On lui annonce exactement la place qui reste une fois la marque et celui
 * déduit du nom du campagne : lui en promettre cinq pour n'en garder que trois
 * serait un mensonge d'interface, et il ne comprendrait pas la disparition.
 */
export const MAX_CUSTOM_HASHTAGS = MAX_HASHTAGS - 2;

/**
 * Analyse la saisie libre des hashtags.
 *
 * Accepte indifféremment `#SIAO, Burkina` et `SIAO Burkina` : personne ne
 * devine la convention attendue, et faire échouer une saisie sur une virgule
 * serait gratuit. Le `#` est facultatif — on ne le réclame pas.
 *
 * Renvoie la **forme de stockage**, sans `#` : c'est une marque d'affichage, et
 * `campaignHashtags` la remet au moment de composer le texte. La garder en base
 * ferait diverger deux écritures du même hashtag selon le chemin emprunté.
 */
export function parseHashtagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const chunk of raw.split(/[\s,;]+/)) {
    const tag = chunk.trim().replace(/^#+/, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_CUSTOM_HASHTAGS) break;
  }

  return out;
}

/**
 * Origine du site, telle que le visiteur la voit.
 *
 * Dans le navigateur, `window.location.origin` est **exact par construction** :
 * c'est l'adresse depuis laquelle la page est réellement servie. `SITE_URL` ne
 * l'est pas — elle vient d'une variable d'environnement, et une variable
 * oubliée ou mal recopiée produirait des liens de partage en `localhost:3000`,
 * invisibles en développement et inutilisables en production.
 *
 * Un lien de partage erroné ne se voit pas : il part dans une conversation
 * WhatsApp et n'en revient jamais. On préfère donc lire l'origine plutôt que de
 * faire confiance à une configuration.
 *
 * Côté serveur — `generateMetadata`, qui alimente `og:url` — il n'y a pas de
 * navigateur, et `SITE_URL` reprend la main.
 */
export function currentOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return SITE_URL;
}

/** Adresse publique d'une campagne — la seule qui puisse être partagée. */
export function publicCampaignUrl(slug: string): string {
  return `${currentOrigin()}/c/${slug}`;
}

/**
 * Adresse privée de distribution, construite à partir d'un jeton.
 *
 * Elle **ne se partage pas** : le jeton *est* le secret d'accès. La route
 * `/d/[token]` désactive d'ailleurs volontairement le partage social, pour
 * qu'un lien privé ne devienne jamais public sans décision explicite.
 *
 * Comme `publicCampaignUrl`, elle part de `window.location.origin` : un lien
 * privé pointant vers `localhost` serait indétectable jusqu'au jour où un
 * client s'en plaindrait.
 */
export function privateDistributionUrl(token: string): string {
  return `${currentOrigin()}/d/${token}`;
}

/** Garantit qu'une chaîne saisie commence par `#`. */
function withHash(value: string): string {
  const trimmed = value.trim().replace(/^#+/, '');
  return trimmed ? `#${trimmed}` : '';
}

/**
 * Transforme un nom de campagne en hashtag lisible.
 *
 * `SIAO 2026` → `#SIAO2026`
 * `Journée de la Femme` → `#JourneeDeLaFemme`
 *
 * Les accents sont retirés : un hashtag accentué se casse dès qu'il traverse un
 * clavier ou un réseau social qui ne normalise pas l'Unicode.
 */
export function toHashtag(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  return words.length > 0 ? `#${words.join('')}` : '';
}

/**
 * Hashtags d'une campagne : la marque, ceux définis par le créateur, puis celui
 * déduit du nom. Dédupliqués, dans cet ordre, et plafonnés.
 */
export function campaignHashtags(
  campaign: Pick<Campaign, 'name' | 'share_hashtags'>,
): string[] {
  const result: string[] = [BRAND_HASHTAG];

  const push = (tag: string) => {
    if (!tag) return;
    const already = result.some((existing) => existing.toLowerCase() === tag.toLowerCase());
    if (!already) result.push(tag);
  };

  for (const tag of campaign.share_hashtags ?? []) push(withHash(tag));

  const derived = toHashtag(campaign.name);
  if (derived) push(derived);

  return result.slice(0, MAX_HASHTAGS);
}

/**
 * Texte de partage.
 *
 * Si le créateur a rédigé le sien, on le respecte : on ne fait qu'y ajouter le
 * lien et les hashtags s'ils n'y figurent pas déjà. Sinon on en compose un à
 * partir du nom de la campagne.
 */
export function buildShareText(
  campaign: Pick<Campaign, 'name' | 'share_text' | 'share_hashtags'>,
  url: string,
): string {
  const tags = campaignHashtags(campaign).join(' ');
  const custom = campaign.share_text?.trim();

  if (custom) {
    let text = custom.includes(url) ? custom : `${custom}\n\n${url}`;
    const hasBrand = text.toLowerCase().includes(BRAND_HASHTAG.toLowerCase());
    if (!hasBrand && tags) text = `${text}\n\n${tags}`;
    return text;
  }

  return (
    `Je participe à la campagne ${campaign.name} ✨\n\n` +
    `Rejoignez la campagne et créez votre propre visuel.\n\n` +
    `${url}\n\n${tags}`
  );
}

/* ------------------------------------------------------------------ */
/* Liens de plateforme — uniquement ceux qui existent réellement        */
/* ------------------------------------------------------------------ */

/**
 * WhatsApp accepte un texte libre, lien compris. `wa.me` fonctionne aussi bien
 * sur mobile (ouverture de l'application) que sur desktop (WhatsApp Web) : c'est
 * le mécanisme officiel, il n'y a donc pas deux branches à écrire.
 */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Facebook ne partage qu'une **URL** : c'est lui qui va lire les balises Open
 * Graph de la page pour construire l'aperçu. On ne lui transmet donc pas de
 * texte — il l'ignorerait.
 */
export function facebookShareUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

/**
 * TikTok n'offre aucun partage web par lien. Cette adresse ouvre la page de
 * dépôt : la publication reste entièrement manuelle, dans TikTok.
 */
export const TIKTOK_UPLOAD_URL = 'https://www.tiktok.com/upload';

/* ------------------------------------------------------------------ */
/* Événements de partage — aucune donnée personnelle                    */
/* ------------------------------------------------------------------ */

/**
 * Ce qu'on enregistre d'un partage.
 *
 * Aucun identifiant de personne, aucune adresse IP, aucune empreinte : seulement
 * le fait qu'un partage a eu lieu, pour quelle plateforme et pour quelle
 * campagne. C'est le minimum qui rende un compteur utile.
 */
export const SHARE_EVENTS = [
  'share_clicked',
  'share_whatsapp',
  'share_facebook',
  'share_tiktok',
  'share_copy_text',
  'share_copy_link',
  'share_download',
] as const;

export type ShareEventType = (typeof SHARE_EVENTS)[number];

export interface ShareStats {
  total: number;
  whatsapp: number;
  facebook: number;
  tiktok: number;
}
