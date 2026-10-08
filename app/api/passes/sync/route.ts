import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';
import { isPawaPayConfigured } from '@/lib/pawapay';
import { getCheckout } from '@/lib/payments/pawapay-checkouts';
import { activatePassForCheckout } from '@/lib/watermark-pass';

/**
 * Réconciliation publique d'un pass, au retour de navigation.
 *
 * `/check` (abonnements) exige une session et renvoie plan/campagne : inadapté à
 * un achat anonyme. Cette route ne renvoie **que** l'état du pass.
 *
 * Le filet que le guide initial omettait : en Mobile Money, l'utilisateur valide
 * son PIN puis ferme parfois l'onglet avant le retour. Le webhook peut ne pas
 * être encore arrivé. Cette route re-vérifie donc le statut chez pawaPay — la
 * seule source de vérité — et active si le paiement est confirmé.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const hits = new Map<string, number[]>();
function rateLimited(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  const { checkoutId } = (await request.json().catch(() => ({}))) as { checkoutId?: string };
  if (!checkoutId || !/^[0-9a-f-]{36}$/i.test(checkoutId)) {
    return NextResponse.json({ error: 'invalid_checkout' }, { status: 400 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ active: false, status: 'unknown' });
  }

  const admin = supabaseAdmin();

  if (isPawaPayConfigured()) {
    try {
      const state = await getCheckout(checkoutId);
      if (state?.completed) {
        await activatePassForCheckout(admin, checkoutId, null, {
          amount: state.amount,
          currency: state.currency,
        });
      }
    } catch (error) {
      // On journalise sans jeter : le pass peut déjà être actif via le webhook.
      console.warn('[passes/sync] Vérification pawaPay impossible :', error);
    }
  }

  const { data: order } = await admin
    .from('watermark_pass_orders')
    .select('status, ends_at')
    .eq('checkout_id', checkoutId)
    .maybeSingle();

  const active = order?.status === 'active';

  return NextResponse.json(
    {
      active,
      status: order?.status ?? 'unknown',
      endsAt: active ? order?.ends_at ?? null : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
