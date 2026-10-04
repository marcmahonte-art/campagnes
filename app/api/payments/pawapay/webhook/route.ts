import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';
import { confirmPayment } from '@/lib/pawapay-confirm';

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
        /*
         * Confirmation via le point unique (`lib/pawapay-confirm.ts`) : il
         * choisit entre crédit de quota de campagne et activation de formule
         * selon la ligne `payments`. Les deux fonctions SQL sont idempotentes,
         * donc un webhook rejoué par pawaPay ne crédite jamais deux fois.
         */
        const result = await confirmPayment(admin, {
          depositId,
          provider,
          phone: phoneNumber,
        });

        if (!result.ok) {
          /*
           * On journalise sans jeter : un 5xx ferait rejouer pawaPay
           * indéfiniment sur une erreur qui ne se résoudra pas toute seule
           * (paiement introuvable, volume invalide). On répond 200 pour
           * acquitter, et l'exploitant voit l'anomalie dans les logs.
           */
          console.warn(
            `[PawaPay Webhook] Confirmation NON aboutie (depositId=${depositId}, nature=${result.kind}) : ${result.error}`,
          );
        } else {
          console.log(
            `[PawaPay Webhook] Succès (${result.kind}) pour depositId=${depositId}`,
          );
        }
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
