import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';
import { checkDepositStatus, isPawaPayConfigured } from '@/lib/pawapay';
import { confirmPayment } from '@/lib/pawapay-confirm';

/**
 * Délai minimal avant qu'un `NOT_FOUND` soit tenu pour définitif.
 *
 * pawaPay enregistre le dépôt **au moment où le client appuie sur « Pay »** sur
 * la page de paiement (« the deposit will only be initiated when the customer
 * presses the pay button »). Un dépôt introuvable signifie donc, en principe,
 * que ce bouton n'a jamais été pressé.
 *
 * Ce délai ne sert qu'à couvrir le cas résiduel d'un appel qui partirait avant
 * la propagation de l'enregistrement chez pawaPay. Il est volontairement court :
 * au-delà, attendre ne changerait rien, puisque la page de paiement est déjà
 * refermée.
 */
const NOT_FOUND_GRACE_MS = 2 * 60 * 1000;

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
      .select('user_id, plan, campaign_id, purchase_type, amount, currency, status, failure_code, failure_message, created_at')
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
        } else if (remoteStatus && remoteStatus.status === 'NOT_FOUND') {
          /*
           * `NOT_FOUND` : pawaPay ne connaît pas ce dépôt.
           *
           * Sa documentation est sans ambiguïté — « Only if the deposit is
           * NOT_FOUND should it be considered FAILED » — et c'est le cas de
           * **tout parcours abandonné** : `/initiate` écrit la ligne `payments`
           * avant d'ouvrir la page de paiement, donc elle existe même quand le
           * client n'a jamais appuyé sur « Pay ».
           *
           * Sans cette branche, la ligne restait `pending` à vie : aucun
           * webhook ne viendra jamais clore un dépôt qui n'existe pas. C'est le
           * défaut constaté en production, où 13 paiements annulés étaient
           * affichés « En cours de vérification » indéfiniment.
           *
           * On écrit `cancelled`, et non `failed` malgré le mot de pawaPay :
           * il ne s'agit pas d'un refus de l'opérateur mais d'une intention
           * jamais engagée. C'est cette distinction qui permet à l'historique
           * du client de masquer la ligne sans masquer un vrai échec, lequel
           * doit rester visible avec son motif.
           *
           * Le `failure_code` garde la trace technique : `DEPOSIT_NOT_FOUND`
           * dit ce que la base a constaté, et l'exploitant peut le distinguer
           * d'une annulation arrivée par callback.
           */
          const createdAt = payment.created_at ? Date.parse(payment.created_at) : NaN;
          const stale =
            !Number.isFinite(createdAt) || Date.now() - createdAt > NOT_FOUND_GRACE_MS;

          if (!stale) {
            /*
             * Trop tôt pour conclure : on ne touche à rien et on rend l'état
             * local. Le webhook a encore le temps d'arriver, et une ligne
             * annulée par erreur serait un mensonge coûteux à corriger.
             */
            return NextResponse.json({
              depositId,
              status: payment.status,
              plan: payment.plan,
              purchaseType: payment.purchase_type,
              campaignId: payment.campaign_id,
            });
          }

          const { error: cancelError } = await admin
            .from('payments')
            .update({
              status: 'cancelled',
              failure_code: 'DEPOSIT_NOT_FOUND',
              failure_message:
                'Aucun dépôt n’a été enregistré : le paiement n’a pas été engagé.',
              updated_at: new Date().toISOString(),
            })
            .eq('deposit_id', depositId)
            // Même garde que partout ailleurs : on ne dégrade jamais une ligne
            // déjà finalisée. Zéro ligne modifiée n'est pas une erreur.
            .eq('status', 'pending');

          if (cancelError) {
            console.warn(
              `[pawaPay Check] Abandon non enregistré (depositId=${depositId}) : ${cancelError.message}`,
            );
          }

          return NextResponse.json({
            depositId,
            status: cancelError ? payment.status : 'cancelled',
            plan: payment.plan,
            purchaseType: payment.purchase_type,
            campaignId: payment.campaign_id,
          });
        }
      } catch (checkErr) {
        console.warn('[pawaPay Check] Impossible d’interroger l’API pawaPay en direct :', checkErr);
      }
    }

    /*
     * Dépôt encore en cours chez pawaPay — `ACCEPTED`, `SUBMITTED`,
     * `PROCESSING`, ou `IN_RECONCILIATION`.
     *
     * `IN_RECONCILIATION` est un état **normal** que pawaPay documente comme ne
     * demandant aucune action : son moteur de rapprochement tranchera. On le
     * laisse donc volontairement en attente, comme les autres — le webhook
     * écrira le statut final.
     *
     * Ces lignes restent visibles dans l'historique du client pendant la
     * fenêtre d'attente, puis disparaissent si rien ne les confirme.
     */
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