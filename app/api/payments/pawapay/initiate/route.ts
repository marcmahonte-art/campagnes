import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured, SITE_URL } from '@/lib/backend/config';
import { PLANS, isPaidPlan, type PlanId } from '@/lib/plans';
import { initiatePaymentPage, isPawaPayConfigured, PawaPayError } from '@/lib/pawapay';

interface InitiateBody {
  plan: PlanId;
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

    const { plan, country, msisdn } = body;

    if (!plan || !isPaidPlan(plan)) {
      return NextResponse.json(
        { error: 'Formule invalide. Seules les formules Creator et Organisation sont éligibles au paiement.' },
        { status: 400 },
      );
    }

    const planConfig = PLANS[plan];
    if (!planConfig || planConfig.priceFcfa <= 0) {
      return NextResponse.json(
        { error: 'Prix de la formule non configuré.' },
        { status: 400 },
      );
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

    const depositId = crypto.randomUUID();
    const returnUrl = `${SITE_URL}/tarifs?depositId=${encodeURIComponent(depositId)}&plan=${encodeURIComponent(plan)}`;

    // Enregistrement de l'intention de paiement avant l'appel à pawaPay
    if (isSupabaseConfigured) {
      try {
        const admin = supabaseAdmin();
        const { error: dbError } = await admin.from('payments').insert({
          deposit_id: depositId,
          user_id: userId,
          plan,
          amount: planConfig.priceFcfa,
          currency: 'XOF',
          status: 'pending',
          metadata: {
            plan_name: planConfig.name,
            user_email: userEmail,
            return_url: returnUrl,
          },
        });

        if (dbError) {
          console.error('[PawaPay] Erreur insertion table payments:', dbError);
          return NextResponse.json(
            { error: `Impossible d'enregistrer la transaction : ${dbError.message}` },
            { status: 500 },
          );
        }
      } catch (adminErr) {
        console.error('[PawaPay] Erreur client Supabase admin:', adminErr);
        return NextResponse.json(
          { error: 'Configuration serveur Supabase incomplète (SUPABASE_SERVICE_ROLE_KEY).' },
          { status: 500 },
        );
      }
    }

    if (!isPawaPayConfigured()) {
      return NextResponse.json(
        {
          error:
            'Le service de paiement pawaPay n’est pas encore configuré (PAWAPAY_API_TOKEN manquant).',
          code: 'PAWAPAY_NOT_CONFIGURED',
        },
        { status: 503 },
      );
    }

    const initiation = await initiatePaymentPage({
      depositId,
      returnUrl,
      amount: planConfig.priceFcfa,
      reason: `Abonnement ${planConfig.name} - Campagnes`,
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
    console.error('[PawaPay] Erreur lors de l’initiation du paiement :', err);
    if (err instanceof PawaPayError) {
      return NextResponse.json(
        { error: err.message, status: err.status, details: err.body },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
