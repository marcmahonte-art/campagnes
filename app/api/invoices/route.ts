import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Facture indisponible en mode démonstration.' }, { status: 404 });
  }

  const invoiceId = request.nextUrl.searchParams.get('id');
  if (!invoiceId) {
    return NextResponse.json({ error: 'Identifiant de facture manquant.' }, { status: 400 });
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

    const { data, error } = await supabaseAdmin()
      .from('invoices')
      .select('id, invoice_number, currency, subtotal, total, status, seller, buyer, lines, issued_at, paid_at')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[Invoices] Lecture impossible :', error);
      return NextResponse.json({ error: 'Impossible de charger cette facture.' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 });
    }

    return NextResponse.json({ invoice: data });
  } catch (error) {
    console.error('[Invoices] Erreur inattendue :', error);
    return NextResponse.json({ error: 'Impossible de charger cette facture.' }, { status: 500 });
  }
}
