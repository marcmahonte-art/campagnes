import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured, SITE_URL } from '@/lib/backend/config';
import { PLANS, isPaidPlan, type PlanId } from '@/lib/plans';
import { initiatePaymentPage, isPawaPayConfigured, PawaPayError } from '@/lib/pawapay';
import {
  PRICING_PLANS,
  getPlanPeriodPrice,
  type BillingDuration,
  DISTRIBUTION_PACKS,
} from '@/lib/pricing/config';

interface InitiateBody {
  plan?: PlanId;
  duration?: BillingDuration;
  packId?: string;
  /**
   * Campagne à créditer. Sa présence transforme le paiement : ce n'est plus un
   * abonnement (qui active une formule) mais un **achat de pack de distribution**
   * (qui crédite le quota de la campagne). Les deux ne se cumulent jamais.
   */
  campaignId?: string;
  country?: string;
  msisdn?: string;
}

export async function POST(request: NextRequest) {
  try {
    let body: InitiateBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Format de requête invalide (JSON attendu).' },
        { status: 400 },
      );
    }

    const { plan, duration = '1m', packId, campaignId, country, msisdn } = body;

    let targetPlan: PlanId | null = 'free';
    let paymentAmount = 0;
    let paymentReason = '';
    let isPack = false;
    /** Distributions créditées à la confirmation. Lu par `credit_campaign_quota`. */
    let distributions: number | null = null;

    if (packId) {
      const pack = DISTRIBUTION_PACKS.find((p) => p.id === packId);
      if (!pack || !pack.priceFcfa || !pack.distributions) {
        return NextResponse.json(
          { error: 'Pack de distribution invalide ou sur devis.' },
          { status: 400 },
        );
      }
      isPack = true;
      paymentAmount = pack.priceFcfa;
      distributions = pack.distributions;
      /*
       * Un pack crédite une campagne, pas une formule : `plan` reste nul sur la
       * ligne `payments` (migration 0018). Écrire un plan factice ferait
       * croire à une activation d'abonnement et tromperait le webhook.
       */
      targetPlan = null;
      paymentReason = `Pack ${pack.name} - Campagnes`;
    } else {
      if (!plan || !isPaidPlan(plan)) {
        return NextResponse.json(
          { error: 'Formule invalide. Seules les formules Créateur et Organisations & ONG sont éligibles au paiement.' },
          { status: 400 },
        );
      }

      targetPlan = plan;
      const periodConfig = getPlanPeriodPrice(plan, duration);
      paymentAmount = periodConfig.totalFcfa;

      if (paymentAmount <= 0) {
        return NextResponse.json(
          { error: 'Montant de la formule non configuré.' },
          { status: 400 },
        );
      }

      const planName = PRICING_PLANS[plan]?.name || PLANS[plan]?.name;
      const periodLabel = duration === '12m' ? '1 an' : duration === '6m' ? '6 mois' : '1 mois';
      paymentReason = `Abonnement ${planName} (${periodLabel}) - Campagnes`;
    }

    /* ---- Un pack DOIT désigner sa campagne, et elle doit être au créateur ---- */
    if (isPack) {
      if (!campaignId) {
        return NextResponse.json(
          { error: 'Campagne manquante : un pack de distribution crédite une campagne précise.' },
          { status: 400 },
        );
      }
    }

    let userId: string;
    let userEmail: string | undefined;

    if (isSupabaseConfigured) {
      const supabase = await supabaseServer();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { error: 'Veuillez vous connecter pour vous abonner.' },
          { status: 401 },
        );
      }

      userId = user.id;
      userEmail = user.email;
    } else {
      // Mode démonstration / développement local
      userId = '00000000-0000-0000-0000-000000000000';
      userEmail = 'demo@example.com';
    }

    /*
     * Vérification de propriété AVANT toute écriture.
     *
     * Le client ne doit pas pouvoir créditer la campagne d'autrui en changeant
     * un identifiant dans la requête. On lit la campagne sous la session de
     * l'utilisateur (RLS) : une campagne qui ne lui appartient pas est
     * introuvable, donc refusée. On ne fait pas confiance au `campaignId` reçu.
     *
     * La lecture passe par le client de session, jamais par le client admin :
     * c'est la RLS qui doit trancher, pas notre propre filtre.
     */
    if (isPack && campaignId && isSupabaseConfigured) {
      const supabase = await supabaseServer();
      const { data: owned } = await supabase
        .from('campaigns')
        .select('id')
        .eq('id', campaignId)
        .maybeSingle();

      if (!owned) {
        return NextResponse.json(
          { error: 'Campagne introuvable ou non autorisée.' },
          { status: 404 },
        );
      }
    }

    const depositId = crypto.randomUUID();
    /*
     * Retour : la page campagne pour un pack, `/tarifs` pour un abonnement.
     * `campaignId` est porté dans l'URL de retour pour que l'écran sache quoi
     * relire au retour — sans lui, on ne saurait pas quel quota vérifier.
     */
    const returnUrl = isPack
      ? `${SITE_URL}/campaigns/${campaignId}?depositId=${encodeURIComponent(depositId)}`
      : `${SITE_URL}/tarifs?depositId=${encodeURIComponent(depositId)}&plan=${encodeURIComponent(targetPlan ?? 'creator')}`;

    // Enregistrement de l'intention de paiement avant l'appel à pawaPay
    if (isSupabaseConfigured) {
      try {
        const admin = supabaseAdmin();
        const { error: dbError } = await admin.from('payments').insert({
          deposit_id: depositId,
          user_id: userId,
          plan: targetPlan,
          campaign_id: isPack ? campaignId : null,
          amount: paymentAmount,
          currency: 'XOF',
          status: 'pending',
          metadata: {
            is_pack: isPack,
            pack_id: packId || null,
            /*
             * Le volume crédité au webhook. Stocké ici, pas recalculé plus tard
             * depuis le catalogue : c'est ce que le client a payé, et il ne doit
             * pas changer si la grille évolue entre l'achat et la confirmation.
             */
            distributions: distributions,
            duration: isPack ? null : duration,
            reason: paymentReason,
            user_email: userEmail,
            return_url: returnUrl,
          },
        });

        if (dbError) {
          console.error('[PawaPay] Erreur insertion table payments:', dbError);
          return NextResponse.json(
            { error: 'Le paiement n’a pas pu être enregistré. Réessayez dans un instant.' },
            { status: 500 },
          );
        }
      } catch (adminErr) {
        console.error('[PawaPay] Erreur client Supabase admin:', adminErr);
        return NextResponse.json(
          { error: 'Le paiement est momentanément indisponible. Réessayez plus tard.' },
          { status: 500 },
        );
      }
    }

    if (!isPawaPayConfigured()) {
      return NextResponse.json(
        {
          /*
           * Message destiné à l'utilisateur : jamais le nom du prestataire ni
           * une variable d'environnement (N11). Le détail technique reste dans
           * le code d'erreur, exploité par le client.
           */
          error: 'Le paiement Mobile Money n’est pas encore disponible.',
          code: 'PAYMENT_NOT_CONFIGURED',
        },
        { status: 503 },
      );
    }

    const initiation = await initiatePaymentPage({
      depositId,
      returnUrl,
      amount: paymentAmount,
      reason: paymentReason,
      country: country || undefined,
      currency: 'XOF',
      msisdn: msisdn || undefined,
    });

    return NextResponse.json({
      success: true,
      depositId,
      redirectUrl: initiation.redirectUrl,
    });
  } catch (err: unknown) {
    /*
     * Le détail technique reste **dans les journaux serveur**. Ce qui remonte au
     * navigateur est un message actionnable, sans nom de prestataire ni détail
     * d'infrastructure (N11).
     */
    console.error('[PawaPay] Erreur lors de l’initiation du paiement :', err);
    if (err instanceof PawaPayError) {
      return NextResponse.json(
        {
          error:
            'Le service de paiement Mobile Money n’a pas répondu correctement. Réessayez dans un instant.',
          code: err.status === 401 || err.status === 403 ? 'PAYMENT_AUTH' : 'PAYMENT_UPSTREAM',
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: 'Le paiement est momentanément indisponible. Réessayez plus tard.' },
      { status: 500 },
    );
  }
}
