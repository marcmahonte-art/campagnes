import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';

export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ balance: 0, ledger: [], invoices: [] });
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

    const admin = supabaseAdmin();
    const [{ data: balance }, { data: ledger }, { data: invoices }, { data: campaigns }] = await Promise.all([
      admin
        .from('account_credit_balances')
        .select('balance, updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      admin
        .from('account_credit_ledger')
        .select('id, amount, kind, balance_after, metadata, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      admin
        .from('invoices')
        .select('id, invoice_number, payment_id, currency, subtotal, total, status, issued_at, paid_at, lines')
        .eq('user_id', user.id)
        .order('issued_at', { ascending: false })
        .limit(30),
      admin
        .from('campaigns')
        .select('id, name, participants_used, participants_granted')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    return NextResponse.json({
      balance: Number(balance?.balance ?? 0),
      ledger: ledger ?? [],
      invoices: invoices ?? [],
      campaigns: campaigns ?? [],
    });
  } catch (error) {
    console.error('[Billing] Impossible de lire le compte :', error);
    return NextResponse.json(
      { error: 'Les informations de paiement sont momentanément indisponibles.' },
      { status: 500 },
    );
  }
}
