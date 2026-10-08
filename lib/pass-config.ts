/**
 * Constantes du pass « Sans filigrane », **sûres côté client**.
 *
 * Ce module ne contient que des littéraux et un import de la grille tarifaire :
 * aucun import Node, aucun accès base. Il est donc importable par un composant
 * navigateur, contrairement à `lib/watermark-pass.ts` (qui porte `node:crypto`
 * et les appels Supabase).
 *
 * Le prix et la durée **ne sont pas réinventés ici** : ils viennent de
 * `PARTICIPANT_PAYMENT`, déjà déclaré dans `lib/pricing/config.ts` et déjà
 * affiché sur `/tarifs`, `/conditions` et la page participant. Ce module ne fait
 * que donner un nom au produit pour les surfaces du pass, afin que l'interface
 * et le serveur ne puissent pas annoncer deux prix différents (règle N3 : aucun
 * montant en dur dans un composant).
 */

import { PARTICIPANT_PAYMENT, formatFcfaPrice } from './pricing/config';

/** Cookie HttpOnly qui identifie le navigateur acheteur. */
export const PASS_COOKIE = 'cn_bid';

/** Durée de vie du cookie (30 jours) : plus long que le pass, volontairement. */
export const PASS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Une seule durée est offerte : 24 heures. */
export const PASS_DURATION_HOURS = PARTICIPANT_PAYMENT.durationHours;

/** Prix du pass, en francs CFA (XOF). Le serveur ne lit jamais le prix du client. */
export const PASS_PRICE_XOF = PARTICIPANT_PAYMENT.priceFcfa;

/** Libellé produit, affiché tel quel à l'utilisateur. */
export const PASS_PRODUCT_LABEL = `Pass sans filigrane — ${PARTICIPANT_PAYMENT.durationHours} h`;

/** Prix formaté pour l'affichage (« 500 FCFA »), via la règle de formatage unique. */
export function formatPassPrice(amount: number = PASS_PRICE_XOF): string {
  return formatFcfaPrice(amount);
}
