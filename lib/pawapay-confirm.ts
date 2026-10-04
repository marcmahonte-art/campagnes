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
 * Ce module porte la seule règle qui compte :
 *
 *   - un paiement rattaché à une **campagne** → `credit_campaign_quota`
 *     (crédite `participants_granted`, idempotent) ;
 *   - un paiement rattaché à une **formule** → `complete_payment_and_activate_plan`
 *     (active le plan du compte, idempotent).
 *
 * Les deux fonctions SQL sont idempotentes : les appeler deux fois ne crédite
 * ni ne débite deux fois. C'est la base, puisque pawaPay rejoue ses webhooks.
 */

export interface ConfirmPaymentInput {
  depositId: string;
  provider?: string | null;
  phone?: string | null;
}

export interface ConfirmPaymentResult {
  /** `true` si la confirmation a abouti (déjà complétée = succès idempotent). */
  ok: boolean;
  /** Nature du paiement confirmé, telle que lue en base. */
  kind: 'campaign_topup' | 'plan_subscription' | 'unknown';
  /** Message d'erreur éventuel, pour la journalisation. */
  error?: string;
}

/**
 * Lit la nature d'un paiement **avant** de confirmer.
 *
 * On ne se fie pas à ce que le client ou le webhook prétend : c'est la ligne
 * `payments` qui dit si ce dépôt crédite une campagne ou active une formule.
 */
export async function describePayment(
  admin: SupabaseClient,
  depositId: string,
): Promise<{ campaignId: string | null; plan: string | null } | null> {
  const { data, error } = await admin
    .from('payments')
    .select('campaign_id, plan')
    .eq('deposit_id', depositId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    campaignId: (data.campaign_id as string | null) ?? null,
    plan: (data.plan as string | null) ?? null,
  };
}

/**
 * Confirme un paiement, quelle que soit sa nature.
 *
 * **Idempotent par construction** : on lit d'abord la nature du paiement, puis
 * on appelle la fonction SQL correspondante, qui porte elle-même la garde
 * `pending → completed`. Un rejeu (webhook dupliqué, `/check` après le webhook)
 * rappelle la même fonction, qui sort sans rien créditer.
 *
 * Ne lève jamais : renvoie `ok = false` avec un message. Un webhook qui jette
 * ferait rejouer pawaPay indéfiniment.
 */
export async function confirmPayment(
  admin: SupabaseClient,
  input: ConfirmPaymentInput,
): Promise<ConfirmPaymentResult> {
  const { depositId, provider = null, phone = null } = input;

  const described = await describePayment(admin, depositId);

  if (!described) {
    return { ok: false, kind: 'unknown', error: 'Paiement introuvable.' };
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
    return { ok: true, kind: 'campaign_topup' };
  }

  // Un paiement d'abonnement active la formule du compte.
  if (described.plan) {
    const { error } = await admin.rpc('complete_payment_and_activate_plan', {
      p_deposit_id: depositId,
      p_provider: provider,
      p_phone: phone,
    });

    if (error) {
      /*
       * Repli direct : la migration 0017 n'est peut-être pas appliquée sur cet
       * environnement. On reproduit la même opération sans la fonction — mais
       * la garde d'idempotence devient notre relecture du statut, d'où la
       * relecture avant d'écrire.
       */
      const { data: payment } = await admin
        .from('payments')
        .select('user_id, plan, status')
        .eq('deposit_id', depositId)
        .maybeSingle();

      if (payment && payment.status !== 'completed' && payment.plan) {
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
          p_user_id: payment.user_id,
          p_plan: payment.plan,
        });
        return { ok: true, kind: 'plan_subscription' };
      }

      return { ok: false, kind: 'plan_subscription', error: error.message };
    }
    return { ok: true, kind: 'plan_subscription' };
  }

  // Ni campagne ni formule : ligne incohérente (contrainte 0018 non appliquée).
  return {
    ok: false,
    kind: 'unknown',
    error: 'Paiement sans cible (ni campagne, ni formule).',
  };
}
