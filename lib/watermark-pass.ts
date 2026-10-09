/**
 * Pass « Sans filigrane » — logique métier, **serveur uniquement**.
 *
 * Ce module décrit le produit, la liaison au navigateur et l'activation. Il ne
 * connaît ni React, ni Fabric, ni la route qui l'appelle : c'est ce qui permet
 * de le tester sans navigateur (`npm run check:watermark-pass`).
 *
 * Deux idées à ne pas perdre de vue :
 *
 *   1. **Aucun compte.** Le droit est porté par un cookie `cn_bid` anonyme, pas
 *      par un `user_id`. C'est ce qui reproduit « achat sans compte ».
 *   2. **Le droit survit à tout.** Le pass vit en base : une rotation de secret,
 *      un redéploiement ou un incident ne l'invalident pas. Un JWT pur, lui,
 *      serait irrévocable et invisible — c'est précisément ce qu'on refuse.
 *
 * Le module ne décide jamais du filigrane : la décision vit dans la route de
 * rendu, après vérification du pass. Ici, on ne fait que dire si un pass est
 * actif pour un navigateur donné.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PASS_COOKIE,
  PASS_COOKIE_MAX_AGE,
  PASS_DURATION_HOURS,
  PASS_PRICE_XOF,
  PASS_PRODUCT_LABEL,
} from './pass-config';

/*
 * Les constantes vivent dans `lib/pass-config.ts` (sans dépendance Node) pour
 * être partageables avec l'interface. On les ré-exporte ici pour que le reste
 * du serveur continue de les lire depuis un seul module.
 */
export { PASS_COOKIE, PASS_COOKIE_MAX_AGE, PASS_DURATION_HOURS, PASS_PRICE_XOF, PASS_PRODUCT_LABEL };

export type PassStatus =
  | 'pending'
  | 'waiting_payment'
  | 'processing'
  | 'active'
  | 'expired'
  | 'failed'
  | 'cancelled';

/** Statuts qui autorisent encore une activation. */
export const PASS_PENDING_STATUSES: readonly PassStatus[] = [
  'pending',
  'waiting_payment',
  'processing',
];

export interface ActivePass {
  id: string;
  ends_at: string;
  duration_h: number;
}

/* ------------------------------------------------------------------ */
/* Identité du navigateur                                              */
/* ------------------------------------------------------------------ */

/** Un identifiant de navigateur neuf. Aléatoire, sans lien avec une personne. */
export function newBrowserId(): string {
  return randomUUID();
}

/**
 * Empreinte du User-Agent.
 *
 * Ce n'est pas une preuve matérielle de navigateur — c'est un durcissement :
 * un cookie volé et rejoué depuis un autre navigateur ne suffit plus. La
 * documentation du produit ne doit pas promettre davantage.
 */
export function hashUserAgent(userAgent: string): string {
  return createHash('sha256').update(userAgent.slice(0, 400)).digest('hex');
}

/* ------------------------------------------------------------------ */
/* Calculs purs — testables sans base                                  */
/* ------------------------------------------------------------------ */

/** Échéance d'un pass acheté à l'instant `from`. */
export function computePassEndsAt(from: Date, hours: number = PASS_DURATION_HOURS): string {
  return new Date(from.getTime() + hours * 3_600_000).toISOString();
}

/** Le pass est-il actif à l'instant `now` ? */
export function isPassActive(
  pass: { status: string; ends_at: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!pass || pass.status !== 'active' || !pass.ends_at) return false;
  const end = new Date(pass.ends_at).getTime();
  return Number.isFinite(end) && end > now.getTime();
}

/** Temps restant avant expiration, en millisecondes (jamais négatif). */
export function remainingMs(endsAt: string, now: Date = new Date()): number {
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - now.getTime());
}

/* ------------------------------------------------------------------ */
/* Accès base — service_role uniquement                                */
/* ------------------------------------------------------------------ */

/** Passe les pass périmés en `expired` (libère l'index unique partiel). */
export async function expirePasses(admin: SupabaseClient): Promise<void> {
  await admin.rpc('expire_watermark_passes');
}

/**
 * Le pass actif d'un navigateur, s'il existe.
 *
 * On lit par `browser_id` **et** `ua_hash` : un cookie copié dans un autre
 * navigateur ne retrouve donc pas le pass.
 */
export async function getActivePass(
  admin: SupabaseClient,
  browserId: string | undefined,
  uaHash: string,
): Promise<ActivePass | null> {
  if (!browserId) return null;
  await expirePasses(admin);

  const { data } = await admin
    .from('watermark_pass_orders')
    .select('id, ends_at, duration_h')
    .eq('browser_id', browserId)
    .eq('ua_hash', uaHash)
    .eq('status', 'active')
    .gt('ends_at', new Date().toISOString())
    .maybeSingle();

  return (data as ActivePass | null) ?? null;
}

/**
 * Active un pass à partir de son `checkout_id`.
 *
 * Idempotent : la fonction SQL porte la garde. Un rejeu ne prolonge rien et ne
 * recrédite rien.
 *
 * `reported` porte le montant et la devise **réellement encaissés**, lus chez la
 * passerelle. La fonction SQL refuse d'activer si l'un des deux ne correspond pas
 * au prix fixé par le serveur à la création de la commande : un paiement partiel,
 * ou dans une autre devise, n'ouvre pas de pass.
 */
export async function activatePassForCheckout(
  admin: SupabaseClient,
  checkoutId: string,
  provider: string | null,
  reported?: { amount?: number | null; currency?: string | null },
): Promise<{ ok: boolean; endsAt?: string; error?: string }> {
  const { data, error } = await admin.rpc('activate_watermark_pass', {
    p_checkout_id: checkoutId,
    p_provider: provider,
    p_amount: reported?.amount ?? null,
    p_currency: reported?.currency ?? null,
  });

  if (error) return { ok: false, error: error.message };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { status?: string; ends_at?: string | null }
    | null
    | undefined;

  if (row && row.status === 'active') {
    return { ok: true, endsAt: row.ends_at ?? undefined };
  }
  return { ok: false, error: 'Pass non activé.' };
}
