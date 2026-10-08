import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/backend/config';
import {
  PASS_COOKIE,
  PASS_PENDING_STATUSES,
  getActivePass,
  hashUserAgent,
  remainingMs,
} from '@/lib/watermark-pass';

/**
 * État du pass pour **ce** navigateur (cookie `cn_bid`).
 *
 * Lecture seule, sans écriture : elle sert à l'interface pour afficher le
 * compte à rebours, un paiement en cours ou le bouton d'achat. Le masquage n'est
 * que de l'ergonomie — la route d'initiation refuse de toute façon (`409`).
 *
 * On ne renvoie **jamais** de montant, de campagne ni d'identité : seulement
 * l'état du droit et, le cas échéant, son échéance.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: NextRequest) {
  const browserId = request.cookies.get(PASS_COOKIE)?.value;
  if (!isSupabaseConfigured || !browserId) {
    return NextResponse.json({ active: false, pending: false }, { headers: NO_STORE });
  }

  const userAgent = request.headers.get('user-agent') ?? '';
  const uaHash = hashUserAgent(userAgent);
  const admin = supabaseAdmin();

  const pass = await getActivePass(admin, browserId, uaHash);
  if (pass) {
    return NextResponse.json(
      {
        active: true,
        pending: false,
        endsAt: pass.ends_at,
        remainingMs: remainingMs(pass.ends_at),
        durationHours: pass.duration_h,
      },
      { headers: NO_STORE },
    );
  }

  /*
   * Un paiement lancé mais non encore confirmé n'est pas un pass : on le signale
   * à part, pour que l'interface affiche « en cours de vérification » plutôt que
   * de reproposer un achat — ce qui ouvrirait un second paiement pour un droit
   * que le premier est en train d'acheter.
   */
  const { data: pending } = await admin
    .from('watermark_pass_orders')
    .select('status')
    .eq('browser_id', browserId)
    .in('status', PASS_PENDING_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(
    { active: false, pending: Boolean(pending) },
    { headers: NO_STORE },
  );
}
