import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';
import { checkDepositStatus, isPawaPayConfigured } from '@/lib/pawapay';
import { confirmPayment } from '@/lib/pawapay-confirm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const depositId = searchParams.get('depositId');

    if (!depositId) {
      return NextResponse.json(
        { error: 'Paramètre depositId manquant.' },
        { status: 400 },
      );
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        depositId,
        status: 'completed',
        mode: 'demo',
      });
    }

    const admin = supabaseAdmin();

    // 1. Consultation en base de données locale
    const { data: payment, error: dbError } = await admin
      .from('payments')
      .select('deposit_id, user_id, plan, campaign_id, amount, currency, status, failure_code, failure_message')
      .eq('deposit_id', depositId)
      .maybeSingle();

    if (dbError) {
      console.error('[PawaPay Check] Erreur lecture payments :', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    if (!payment) {
      return NextResponse.json(
        { error: 'Paiement introuvable.' },
        { status: 404 },
      );
    }

    // Si déjà finalisé, renvoyer l'état
    if (payment.status === 'completed' || payment.status === 'failed') {
      return NextResponse.json({
        depositId,
        status: payment.status,
        plan: payment.plan,
        campaignId: payment.campaign_id,
        failureCode: payment.failure_code,
        failureMessage: payment.failure_message,
      });
    }

    // 2. Si encore pending, interroger pawaPay en direct pour réconciliation
    if (isPawaPayConfigured()) {
      try {
        const remoteStatus = await checkDepositStatus(depositId);

        if (remoteStatus && remoteStatus.status === 'COMPLETED') {
          /*
           * Même point unique que le webhook : il décide entre crédit de quota
           * de campagne et activation de formule, et reste idempotent. Sans
           * cela, un webhook déjà passé puis un `/check` créditeraient deux
           * fois la campagne.
           */
          const result = await confirmPayment(admin, {
            depositId,
            provider: remoteStatus.payer?.accountDetails?.provider ?? null,
            phone: remoteStatus.payer?.accountDetails?.phoneNumber ?? null,
          });

          return NextResponse.json({
            depositId,
            status: result.ok ? 'completed' : payment.status,
            plan: payment.plan,
            campaignId: payment.campaign_id,
            ...(result.ok ? {} : { error: result.error }),
          });
        } else if (remoteStatus && remoteStatus.status === 'FAILED') {
          const failureCode = remoteStatus.failureReason?.failureCode ?? 'FAILED';
          const failureMessage = remoteStatus.failureReason?.failureMessage ?? 'Échec du paiement.';

          await admin
            .from('payments')
            .update({
              status: 'failed',
              failure_code: failureCode,
              failure_message: failureMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('deposit_id', depositId);

          return NextResponse.json({
            depositId,
            status: 'failed',
            failureCode,
            failureMessage,
          });
        }
      } catch (checkErr) {
        console.warn('[PawaPay Check] Impossible d’interroger l’API pawaPay en direct :', checkErr);
      }
    }

    return NextResponse.json({
      depositId,
      status: payment.status,
      plan: payment.plan,
      campaignId: payment.campaign_id,
    });
  } catch (err: unknown) {
    console.error('[PawaPay Check] Erreur :', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur interne du serveur.' },
      { status: 500 },
    );
  }
}
