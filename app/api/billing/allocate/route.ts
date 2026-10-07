import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'La gestion des crédits nécessite un compte connecté.' }, { status: 503 });
  }

  let body: { campaignId?: string; amount?: number; reference?: string };
  try {
    body = (await request.json()) as { campaignId?: string; amount?: number; reference?: string };
  } catch {
    return NextResponse.json({ error: 'Format de requête invalide.' }, { status: 400 });
  }

  const campaignId = typeof body.campaignId === 'string' ? body.campaignId : '';
  const amount = Number(body.amount);
  const reference = typeof body.reference === 'string' ? body.reference : '';
  if (!campaignId || !Number.isInteger(amount) || amount <= 0 || !/^[0-9a-f-]{36}$/i.test(reference)) {
    return NextResponse.json({ error: 'Sélectionnez une campagne et un nombre de crédits supérieur à zéro.' }, { status: 400 });
  }

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Veuillez vous connecter.' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin().rpc('allocate_account_credits', {
      p_user_id: user.id,
      p_campaign_id: campaignId,
      p_amount: amount,
      p_reference: reference,
    });

    if (error) {
      const message = /insuffisant|supérieur|autorisé|introuvable/i.test(error.message)
        ? error.message
        : 'Impossible d’affecter les crédits à cette campagne.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ balance: Number((data as { balance?: number } | null)?.balance ?? 0) });
  } catch (error) {
    console.error('[Billing] Affectation de crédits impossible :', error);
    return NextResponse.json({ error: 'Impossible d’affecter les crédits pour le moment.' }, { status: 500 });
  }
}
