import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Confirmation d'un paiement pawaPay — **un seul point de vérité**.
 *
 * Le webhook et la route `/check` doivent confirmer un paiement de la **même**
 * façon : le webhook reçoit la notification, `/check` réconcilie au retour de
 * navigation. Si chacun décidait de son côté quelle fonction appeler, une
 * divergence silencieuse s'installerait — par exemple `/check` qui activerait
 * une formule là où le webhook crédite un quota, ou l'inverse.
 *
 * Ce module porte les trois règles qui comptent :
 *
 *   1. **Le montant payé doit être celui attendu.** Avant toute écriture, on
 *      compare le montant rapporté par pawaPay à celui figé sur la ligne
 *      `payments`. Sans cette comparaison, un paiement partiel ou une
 *      notification falsifiée créditerait pour le prix fort.
 *   2. **Un paiement rattaché à une campagne** → `credit_campaign_quota`
 *      (crédite `participants_granted`, idempotent).
 *   3. **Un paiement rattaché à une formule** → `complete_payment_and_activate_plan`
 *      (active le plan du compte, idempotent).
 *
 * Les deux fonctions SQL sont idempotentes : les appeler deux fois ne crédite
 * ni ne débite deux fois. C'est la base, puisque pawaPay rejoue ses webhooks.
 */

export interface ConfirmPaymentInput {
  depositId: string;
  provider?: string | null;
  phone?: string | null;
  /** Montant effectivement encaissé, rapporté par pawaPay. */
  amount?: string | number | null;
  /** Devise effectivement encaissée, rapportée par pawaPay. */
  currency?: string | null;
}

export interface ConfirmPaymentResult {
  /** `true` si la confirmation a abouti (déjà complétée = succès idempotent). */
  ok: boolean;
  /** Nature du paiement confirmé, telle que lue en base. */
  kind: 'campaign_topup' | 'account_credits' | 'plan_subscription' | 'unknown';
  /** Message d'erreur éventuel, pour la journalisation. */
  error?: string;
}

/** Détail d'une ligne `payments`, pour décider quoi confirmer. */
interface PaymentDescription {
  campaignId: string | null;
  plan: string | null;
  purchaseType: 'plan' | 'campaign_topup' | 'account_credits' | null;
  amount: number | null;
  currency: string | null;
}

/**
 * Lit la nature et le montant attendu d'un paiement **avant** de confirmer.
 *
 * On ne se fie pas à ce que le client ou le webhook prétend : c'est la ligne
 * `payments` qui dit si ce dépôt crédite une campagne ou active une formule,
 * et pour quel prix.
 */
export async function describePayment(
  admin: SupabaseClient,
  depositId: string,
): Promise<PaymentDescription | null> {
  const { data, error } = await admin
    .from('payments')
    .select('campaign_id, plan, purchase_type, amount, currency')
    .eq('deposit_id', depositId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    campaignId: (data.campaign_id as string | null) ?? null,
    plan: (data.plan as string | null) ?? null,
    purchaseType:
      data.purchase_type === 'campaign_topup' ||
      data.purchase_type === 'account_credits' ||
      data.purchase_type === 'plan'
        ? data.purchase_type
        : null,
    amount: data.amount === null || data.amount === undefined ? null : Number(data.amount),
    currency: (data.currency as string | null) ?? null,
  };
}

/**
 * Comparaison des montants en centimes.
 *
 * Le passage par `Math.round(v * 100)` évite qu'un `numeric(12,2)` relu en
 * flottant (`3000.0000000000005`) soit jugé différent de l'entier attendu.
 */
function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Vérifie que ce que pawaPay dit avoir encaissé correspond à la vente.
 *
 * `reported` vient de pawaPay (webhook signé, ou `/check` qui interroge
 * `GET /v2/deposits/{id}`). `expected` vient de la ligne `payments`, figée à
 * l'initiation.
 *
 * Deux garde-fous distincts :
 *   - si pawaPay ne **rapporte aucun** montant, on ne peut pas vérifier : on
 *     refuse quand même en production (un montant absent ne vaut pas un montant
 *     correct), mais le journal le signale ;
 *   - si les montants diffèrent, on refuse, et l'anomalie est visible.
 */
async function issueInvoice(admin: SupabaseClient, depositId: string): Promise<void> {
  const { error } = await admin.rpc('issue_invoice_for_payment', {
    p_deposit_id: depositId,
  });
  if (error) {
    // Le paiement est déjà confirmé : l'émission sera réessayée par un support
    // ou un job ultérieur, mais elle ne doit jamais annuler l'achat.
    console.warn(`[PawaPay] Facture non émise pour ${depositId}:`, error.message);
  }
}

function checkAmount(
  reported: string | number | null | undefined,
  expected: number | null,
): string | null {
  if (expected === null || Number.isNaN(expected)) {
    return 'Montant attendu illisible sur la ligne payments.';
  }

  if (reported === null || reported === undefined || reported === '') {
    return 'pawaPay n’a pas indiqué le montant encaissé : confirmation refusée par prudence.';
  }

  const reportedNumber = Number(reported);
  if (Number.isNaN(reportedNumber)) {
    return `Montant encaissé illisible : « ${String(reported)} ».`;
  }

  if (toCents(reportedNumber) !== toCents(expected)) {
    return (
      `Montant incohérent : encaissé ${reportedNumber} ${'XOF'} mais vente enregistrée ${expected}. ` +
      'Aucune formule ni quota n’a été crédité.'
    );
  }

  return null;
}

/**
 * Confirme un paiement, quelle que soit sa nature.
 *
 * **Idempotent par construction** : on lit d'abord la nature et le montant du
 * paiement, puis on appelle la fonction SQL correspondante, qui porte
 * elle-même la garde `pending → completed`. Un rejeu (webhook dupliqué, `/check`
 * après le webhook) rappelle la même fonction, qui sort sans rien créditer.
 *
 * Ne lève jamais : renvoie `ok = false` avec un message. Un webhook qui jette
 * ferait rejouer pawaPay indéfiniment.
 */
export async function confirmPayment(
  admin: SupabaseClient,
  input: ConfirmPaymentInput,
): Promise<ConfirmPaymentResult> {
  const { depositId, provider = null, phone = null, amount = null, currency = null } = input;

  const described = await describePayment(admin, depositId);

  if (!described) {
    return { ok: false, kind: 'unknown', error: 'Paiement introuvable.' };
  }

  const kind: ConfirmPaymentResult['kind'] = described.purchaseType === 'campaign_topup'
    ? 'campaign_topup'
    : described.purchaseType === 'account_credits'
      ? 'account_credits'
      : described.plan
        ? 'plan_subscription'
        : 'unknown';

  /*
   * Le montant est contrôlé AVANT toute écriture, et avant même le choix de la
   * fonction : c'est le seul endroit où l'on est encore sûr de n'avoir rien
   * crédité. Un écart de prix doit laisser le paiement en `pending` pour que
   * l'exploitant tranche, pas le passer en `completed` au prix fort.
   */
  const amountError = checkAmount(amount, described.amount);
  if (amountError) {
    return { ok: false, kind, error: amountError };
  }

  if (currency && described.currency && currency.toUpperCase() !== described.currency.toUpperCase()) {
    return {
      ok: false,
      kind,
      error: `Devise incohérente : encaissé ${currency} mais vente enregistrée en ${described.currency}.`,
    };
  }

  // Un paiement de pack désigne sa campagne : c'est elle qu'on crédite.
  if (described.campaignId) {
    const { error } = await admin.rpc('credit_campaign_quota', {
      p_deposit_id: depositId,
      p_provider: provider,
      p_phone: phone,
    });

    if (error) {
      return { ok: false, kind: 'campaign_topup', error: error.message };
    }
    await issueInvoice(admin, depositId);
    return { ok: true, kind: 'campaign_topup' };
  }

  // Un achat sans campagne alimente le portefeuille de crédits du compte.
  if (described.purchaseType === 'account_credits') {
    const { error } = await admin.rpc('credit_account_credits', {
      p_deposit_id: depositId,
      p_provider: provider,
      p_phone: phone,
    });

    if (error) {
      return { ok: false, kind: 'account_credits', error: error.message };
    }
    await issueInvoice(admin, depositId);
    return { ok: true, kind: 'account_credits' };
  }

  // Un paiement d'abonnement active la formule du compte.
  if (described.plan) {
    /*
     * La durée payée est lue dans les métadonnées du paiement (figées à
     * l'initiation) et transmise à la fonction SQL, qui en dérive la date
     * d'échéance. C'est ce qui empêche un abonnement « 1 mois » de durer
     * indéfiniment.
     */
    const { data: forDuration } = await admin
      .from('payments')
      .select('user_id, status, metadata')
      .eq('deposit_id', depositId)
      .maybeSingle();

    const duration =
      forDuration?.metadata && typeof forDuration.metadata.duration === 'string'
        ? forDuration.metadata.duration
        : null;

    const { error } = await admin.rpc('complete_payment_and_activate_plan', {
      p_deposit_id: depositId,
      p_provider: provider,
      p_phone: phone,
      p_duration: duration,
    });

    if (error) {
      /*
       * Repli direct : la migration 0017 (ou 0020) n'est peut-être pas appliquée
       * sur cet environnement. On reproduit la même opération sans la
       * fonction — mais la garde d'idempotence devient notre relecture du
       * statut, d'où la relecture avant d'écrire.
       */
      if (forDuration && forDuration.status !== 'completed' && described.plan) {
        await admin
          .from('payments')
          .update({
            status: 'completed',
            provider: provider ?? undefined,
            phone_number: phone ?? undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('deposit_id', depositId);

        await admin.rpc('set_user_plan', {
          p_user_id: forDuration.user_id,
          p_plan: described.plan,
          p_expires_at: computeExpiry(duration, new Date()),
        });
        await issueInvoice(admin, depositId);
        return { ok: true, kind: 'plan_subscription' };
      }

      return { ok: false, kind: 'plan_subscription', error: error.message };
    }
    await issueInvoice(admin, depositId);
    return { ok: true, kind: 'plan_subscription' };
  }

  // Ni campagne ni formule : ligne incohérente (contrainte 0018 non appliquée).
  return {
    ok: false,
    kind: 'unknown',
    error: 'Paiement sans cible (ni campagne, ni formule).',
  };
}

/**
 * Date d'échéance d'un abonnement, à partir de sa durée payée.
 *
 * Dupliqué de la logique SQL pour que le repli JavaScript (migration absente)
 * attribue la même échéance que la base. Un décalage entre les deux donnerait un
 * abonnement qui expire trop tôt ou trop tard selon le chemin emprunté.
 */
export function computeExpiry(duration: string | null, from: Date): string | null {
  const months = duration === '12m' ? 12 : duration === '6m' ? 6 : 1;

  const expiry = new Date(from.getTime());
  /*
   * `setUTCMonth` déborde sur le mois suivant le 31 janvier : le 31 janvier + 1
   * mois donnerait le 3 mars. On recale sur le dernier jour du mois visé quand
   * la date cible n'existe pas.
   */
  const targetMonth = expiry.getUTCMonth() + months;
  const lastDayOfTarget = new Date(
    Date.UTC(expiry.getUTCFullYear(), targetMonth + 1, 0),
  ).getUTCDate();

  expiry.setUTCDate(Math.min(expiry.getUTCDate(), lastDayOfTarget));
  expiry.setUTCMonth(targetMonth);

  return expiry.toISOString();
}