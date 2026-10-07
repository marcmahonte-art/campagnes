import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';
import { checkDepositStatus, isPawaPayConfigured } from '@/lib/pawapay';
import { confirmPayment } from '@/lib/pawapay-confirm';

/**
 * Réconciliation d'un paiement au retour de navigation.
 *
 * Cette route est **privée** : elle exige une session et vérifie que le paiement
 * appartient bien à l'appelant. Sans cela, connaître un `depositId` suffirait à
 * lire le plan, la campagne et le montant d'une commande qui n'est pas la
 * sienne, et surtout à déclencher une confirmation.
 */
export async function GET(request: NextRequest) {
  try {
    const depositId = request.nextUrl.searchParams.get('depositId');

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

    /*
     * Session obligatoire avant toute lecture. On ne lit pas encore la ligne
     * `payments` : inutile de révéler son existence à quelqu'un qui n'est pas
     * connecté.
     */
    const supabase = await supabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Veuillez vous connecter pour vérifier ce paiement.' },
        { status: 401 },
      );
    }

    const admin = supabaseAdmin();

    // 1. Consultation en base de données locale
    const { data: payment, error: dbError } = await admin
      .from('payments')
      .select('user_id, plan, campaign_id, purchase_type, amount, currency, status, failure_code, failure_message')
      .eq('deposit_id', depositId)
      .maybeSingle();

    if (dbError) {
      console.error('[pawaPay Check] Erreur lecture payments :', dbError);
      return NextResponse.json(
        { error: 'Impossible de vérifier le paiement pour le moment.' },
        { status: 500 },
      );
    }

    if (!payment) {
      return NextResponse.json(
        { error: 'Paiement introuvable.' },
        { status: 404 },
      );
    }

    /*
     * Le contrôle de propriété vient **après** la lecture, jamais avant : il faut
     * connaître le propriétaire pour le comparer. Un paiement qui n'appartient
     * pas à l'appelant répond 404, exactement comme un paiement inexistant —
     * répondre 403 confirmerait son existence.
     */
    if (payment.user_id !== user.id) {
      console.warn(
        `[pawaPay Check] depositId=${depositId} consulté par un compte qui n'en est pas le propriétaire.`,
      );
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
        purchaseType: payment.purchase_type,
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
           * de campagne et activation de formule, **après** avoir vérifié le
           * montant encaissé, et reste idempotent. Sans cela, un webhook déjà
           * passé puis un `/check` créditeraient deux fois la campagne.
           */
          const result = await confirmPayment(admin, {
            depositId,
            provider: remoteStatus.payer?.accountDetails?.provider ?? null,
            phone: remoteStatus.payer?.accountDetails?.phoneNumber ?? null,
            amount: remoteStatus.amount ?? null,
            currency: remoteStatus.currency ?? null,
          });

          if (!result.ok) {
            /*
             * Un montant incohérent est une anomalie comptable, pas une erreur
             * passagère : on le journalise avec le détail, et on laisse le
             * paiement en l'état plutôt que de le solder.
             */
            console.warn(
              `[pawaPay Check] Confirmation refusée (depositId=${depositId}, nature=${result.kind}) : ${result.error}`,
            );
          }

          return NextResponse.json({
            depositId,
            status: result.ok ? 'completed' : payment.status,
            plan: payment.plan,
            purchaseType: payment.purchase_type,
            campaignId: payment.campaign_id,
            ...(result.ok ? {} : { error: result.error }),
          });
        } else if (remoteStatus && remoteStatus.status === 'FAILED') {
          const failureCode = remoteStatus.failureReason?.failureCode ?? 'FAILED';
          const failureMessage = remoteStatus.failureReason?.failureMessage ?? 'Échec du paiement.';

          /*
           * Même garde que le webhook : un échec ne dégrade pas une ligne déjà
           * finalisée. `/check` et le webhook doivent écrire de la même façon,
           * sinon la réconciliation et la notification racontent deux histoires
           * différentes de la même commande.
           */
          await admin
            .from('payments')
            .update({
              status: 'failed',
              failure_code: failureCode,
              failure_message: failureMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('deposit_id', depositId)
            .eq('status', 'pending');

          return NextResponse.json({
            depositId,
            status: 'failed',
            failureCode,
            failureMessage,
          });
        }
      } catch (checkErr) {
        console.warn('[pawaPay Check] Impossible d’interroger l’API pawaPay en direct :', checkErr);
      }
    }

    return NextResponse.json({
      depositId,
      status: payment.status,
      plan: payment.plan,
      purchaseType: payment.purchase_type,
      campaignId: payment.campaign_id,
    });
  } catch (err: unknown) {
    console.error('[pawaPay Check] Erreur :', err);
    return NextResponse.json(
      { error: 'Impossible de vérifier le paiement pour le moment.' },
      { status: 500 },
    );
  }
}