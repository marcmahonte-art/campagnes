import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured, SITE_URL } from '@/lib/backend/config';
import { PLANS, isPaidPlan, type PlanId } from '@/lib/plans';
import {
  assertPaymentEnvironmentIsSound,
  initiatePaymentPage,
  isPawaPayConfigured,
  PawaPayError,
} from '@/lib/pawapay';
import {
  PRICING_PLANS,
  getPlanPeriodPrice,
  type BillingDuration,
  DISTRIBUTION_PACKS,
} from '@/lib/pricing/config';
import { COMPANY, PRODUCT, orToComplete } from '@/lib/company';
import {
  DEFAULT_PAYMENT_COUNTRY,
  payableCountriesLabel,
  resolvePaymentCountry,
} from '@/lib/payments/corridors';

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

    /*
     * Le pays vient du client : il est donc **validé**, jamais relayé tel quel.
     *
     * Deux refus distincts, deux messages distincts — c'est tout l'intérêt de
     * séparer « corridor inconnu » de « corridor sans grille » : le premier
     * signale une requête fabriquée, le second une zone où le paiement n'est
     * simplement pas encore ouvert. Les confondre ferait croire à un bug pour
     * une zone que nous n'avons pas encore tarifée.
     */
    const corridor = resolvePaymentCountry(country ?? DEFAULT_PAYMENT_COUNTRY);

    if (!corridor.ok) {
      return NextResponse.json(
        {
          error:
            corridor.reason === 'unknown'
              ? 'Pays de paiement non pris en charge.'
              : `Le paiement Mobile Money n’est pas encore ouvert dans ce pays. Pays disponibles : ${payableCountriesLabel()}.`,
          code: corridor.reason === 'unknown' ? 'PAYMENT_COUNTRY_UNKNOWN' : 'PAYMENT_COUNTRY_NOT_PRICED',
        },
        { status: 400 },
      );
    }

    /*
     * La devise découle du pays, jamais l'inverse. Figer « XOF » ici
     * enverrait un montant en francs CFA sur un corridor en cedi ou en naira.
     */
    const paymentCurrency = corridor.corridor.currency;

    let targetPlan: PlanId | null = 'free';
    let paymentAmount = 0;
    let paymentReason = '';
    let isPack = false;
    let purchaseType: 'plan' | 'campaign_topup' | 'account_credits' = 'plan';
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
       * Avec une campagne, le comportement historique est conservé. Sans
       * campagne, le pack alimente le portefeuille de crédits du compte : le
       * paiement ne doit pas être bloqué par l'absence d'une campagne choisie.
       */
      targetPlan = null;
      purchaseType = campaignId ? 'campaign_topup' : 'account_credits';
      paymentReason = campaignId
        ? `Pack ${pack.name} - Campagnes`
        : `Crédits de compte — ${pack.name} - Campagnes`;
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

    /* ---- Une campagne est obligatoire uniquement pour l'ancien topup ciblé ---- */
    if (isPack && purchaseType === 'campaign_topup' && !campaignId) {
      return NextResponse.json(
        { error: 'Campagne manquante pour cette recharge ciblée.' },
        { status: 400 },
      );
    }

    let userId: string;
    let userEmail: string | undefined;
    let buyerName = 'À COMPLÉTER';

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
      const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
      if (typeof metadataName === 'string' && metadataName.trim()) buyerName = metadataName.trim();
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
     * Tous les nouveaux achats reviennent dans le tunnel du dashboard. Le
     * parcours historique des topups campagne garde sa page de campagne pour
     * ne pas casser les paiements déjà initiés.
     */
    const returnUrl = purchaseType === 'campaign_topup'
      ? `${SITE_URL}/campaigns/${campaignId}?depositId=${encodeURIComponent(depositId)}`
      : `${SITE_URL}/dashboard/acheter?depositId=${encodeURIComponent(depositId)}&type=${purchaseType === 'account_credits' ? 'credits' : 'plan'}`;

    // Enregistrement de l'intention de paiement avant l'appel à pawaPay
    if (isSupabaseConfigured) {
      try {
        const admin = supabaseAdmin();
        if (isSupabaseConfigured) {
          const { data: profile } = await admin
            .from('users')
            .select('org_name')
            .eq('id', userId)
            .maybeSingle();
          if (typeof profile?.org_name === 'string' && profile.org_name.trim()) {
            buyerName = profile.org_name.trim();
          }
        }

        const invoiceLabel = paymentReason;
        const { error: dbError } = await admin.from('payments').insert({
          deposit_id: depositId,
          user_id: userId,
          plan: targetPlan,
          campaign_id: purchaseType === 'campaign_topup' ? campaignId : null,
          purchase_type: purchaseType,
          amount: paymentAmount,
          currency: paymentCurrency,
          status: 'pending',
          metadata: {
            /*
             * Le corridor est figé avec la vente : c'est ce qui permet, à la
             * réconciliation, de savoir de quel pays venait l'encaissement —
             * et de relire la facture dans la devise réellement payée.
             */
            country: corridor.corridor.countryCode,
            currency: paymentCurrency,
            is_pack: isPack,
            pack_id: packId || null,
            purchase_type: purchaseType,
            credit_amount: purchaseType === 'account_credits' ? distributions : null,
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
            seller: {
              name: COMPANY.legalName,
              product: PRODUCT.name,
              address: COMPANY.address,
              email: COMPANY.email,
              rccm: COMPANY.rccm,
            },
            buyer: {
              name: orToComplete(buyerName),
              email: orToComplete(userEmail),
            },
            invoice_lines: [
              {
                description: invoiceLabel,
                quantity: 1,
                unit_amount: paymentAmount,
                total: paymentAmount,
              },
            ],
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

    /*
     * Refus **avant** d'ouvrir la page de paiement, et après avoir écrit la
     * ligne `payments`.
     *
     * L'ordre est délibéré. L'environnement est contrôlé après l'insertion
     * pour que le refus soit attributed à une trace en base ; si l'on contrôlait
     * avant, une configuration cassée ne laisserait aucun journal et le client
     * n'aurait aucun moyen de nous dire ce qui s'est passé.
     *
     * En pratique ce refus ne survient que si `PAWAPAY_BASE_URL` ou le jeton ont
     * été modifiés à chaud — `lib/pawapay.ts` refuse déjà de démarrer sans ces
     * variables en production.
     */
    const environmentProblem = assertPaymentEnvironmentIsSound();
    if (environmentProblem) {
      console.error('[pawaPay] Configuration de paiement inutilisable :', environmentProblem);
      return NextResponse.json(
        {
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
      country: corridor.corridor.countryCode,
      currency: paymentCurrency,
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
