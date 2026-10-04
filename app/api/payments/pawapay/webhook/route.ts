import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';

interface PawaPayWebhookPayload {
  depositId: string;
  status: 'COMPLETED' | 'FAILED' | 'ACCEPTED' | 'SUBMITTED' | string;
  amount?: string | number;
  currency?: string;
  payer?: {
    type?: string;
    accountDetails?: {
      phoneNumber?: string;
      provider?: string;
    };
  };
  failureReason?: {
    failureCode?: string;
    failureMessage?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON payload invalide.' }, { status: 400 });
    }

    const items: PawaPayWebhookPayload[] = Array.isArray(payload)
      ? (payload as PawaPayWebhookPayload[])
      : [payload as PawaPayWebhookPayload];

    if (!items.length || !items[0]?.depositId) {
      return NextResponse.json({ error: 'depositId manquant dans le payload.' }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      console.warn('[PawaPay Webhook] Supabase non configuré. Notification reçue en mode local :', items);
      return NextResponse.json({ received: true, mode: 'local' });
    }

    const admin = supabaseAdmin();

    for (const item of items) {
      const depositId = item.depositId;
      const status = item.status;
      const provider = item.payer?.accountDetails?.provider ?? null;
      const phoneNumber = item.payer?.accountDetails?.phoneNumber ?? null;

      console.log(`[PawaPay Webhook] Traitement depositId=${depositId}, status=${status}`);

      if (status === 'COMPLETED') {
        // Tentative d'exécution de la procédure atomique de la migration 0017
        const { error: rpcError } = await admin.rpc('complete_payment_and_activate_plan', {
          p_deposit_id: depositId,
          p_provider: provider,
          p_phone: phoneNumber,
        });

        if (rpcError) {
          console.warn('[PawaPay Webhook] RPC complete_payment_and_activate_plan a échoué, repli manuel :', rpcError.message);

          // Repli direct : mise à jour de la table et activation du plan
          const { data: payment, error: fetchErr } = await admin
            .from('payments')
            .select('user_id, plan')
            .eq('deposit_id', depositId)
            .maybeSingle();

          if (!fetchErr && payment) {
            await admin
              .from('payments')
              .update({
                status: 'completed',
                provider: provider ?? undefined,
                phone_number: phoneNumber ?? undefined,
                updated_at: new Date().toISOString(),
              })
              .eq('deposit_id', depositId);

            await admin.rpc('set_user_plan', {
              p_user_id: payment.user_id,
              p_plan: payment.plan,
            });
          }
        }

        console.log(`[PawaPay Webhook] Succès : compte activé pour depositId=${depositId}`);
      } else if (status === 'FAILED') {
        const failureCode = item.failureReason?.failureCode ?? 'UNKNOWN_FAILURE';
        const failureMessage = item.failureReason?.failureMessage ?? 'Le paiement a échoué.';

        await admin
          .from('payments')
          .update({
            status: 'failed',
            failure_code: failureCode,
            failure_message: failureMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('deposit_id', depositId);

        console.log(`[PawaPay Webhook] Échec enregistré pour depositId=${depositId}: ${failureCode}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    console.error('[PawaPay Webhook] Erreur traitement webhook :', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur interne webhook.' },
      { status: 500 },
    );
  }
}
