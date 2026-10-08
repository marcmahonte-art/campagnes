import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSupabaseConfigured, SITE_URL } from '@/lib/backend/config';
import { resolvePaymentCountry } from '@/lib/payments/corridors';
import {
  PASS_COOKIE,
  PASS_COOKIE_MAX_AGE,
  PASS_DURATION_HOURS,
  PASS_PENDING_STATUSES,
  PASS_PRICE_XOF,
  getActivePass,
  hashUserAgent,
  newBrowserId,
} from '@/lib/watermark-pass';
import { createCheckout } from '@/lib/payments/pawapay-checkouts';
import { assertPaymentEnvironmentIsSound, isPawaPayConfigured } from '@/lib/pawapay';

/**
 * Initiation **anonyme** du pass « Sans filigrane » — route séparée de
 * `app/api/payments/pawapay/initiate`, qui exige une session et gère les
 * abonnements et packs.
 *
 * Règles tenues ici :
 *   - aucun compte : le droit est porté par le cookie `cn_bid` ;
 *   - le prix et la durée sont fixés par le serveur, jamais par le client ;
 *   - le pays est **validé** par les corridors, jamais relayé tel quel ;
 *   - un seul pass actif par navigateur (garde serveur, pas seulement l'UI) ;
 *   - aucune activation dans cette route : elle n'ouvre qu'une page de paiement.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  /*
   * Le pays est validé avant tout appel réseau. Deux refus distincts :
   * « inconnu » (requête fabriquée) et « pas encore ouvert » (zone non
   * tarifée) — les confondre ferait passer un manque de couverture pour un bug.
   */
  const corridor = resolvePaymentCountry(typeof body.country === 'string' ? body.country : null);
  if (!corridor.ok) {
    return NextResponse.json(
      {
        error:
          corridor.reason === 'unknown'
            ? 'Pays de paiement non pris en charge.'
            : 'Le paiement Mobile Money n’est pas encore ouvert dans ce pays.',
        code: corridor.reason === 'unknown' ? 'PASS_COUNTRY_UNKNOWN' : 'PASS_COUNTRY_NOT_PRICED',
      },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Le paiement est momentanément indisponible.' }, { status: 503 });
  }

  const userAgent = request.headers.get('user-agent') ?? '';
  const existingBid = request.cookies.get(PASS_COOKIE)?.value;
  const browserId = existingBid ?? newBrowserId();
  const uaHash = hashUserAgent(userAgent);
  const admin = supabaseAdmin();

  // Garde serveur : un pass actif interdit un nouvel achat (409).
  const active = await getActivePass(admin, existingBid, uaHash);
  if (active) {
    return NextResponse.json({ error: 'already_active', endsAt: active.ends_at }, { status: 409 });
  }

  /*
   * Un paiement en attente n'est pas un pass : on ne crée pas un second
   * checkout, on renvoie le sien. Sans cela, un utilisateur qui recharge la
   * page après le PIN lancerait plusieurs paiements pour le même droit.
   */
  const { data: pending } = await admin
    .from('watermark_pass_orders')
    .select('checkout_id')
    .eq('browser_id', browserId)
    .in('status', PASS_PENDING_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending?.checkout_id) {
    return NextResponse.json({ error: 'already_pending', checkoutId: pending.checkout_id }, { status: 409 });
  }

  if (!isPawaPayConfigured()) {
    return NextResponse.json({ error: 'Le paiement Mobile Money n’est pas encore disponible.' }, { status: 503 });
  }

  const environmentProblem = assertPaymentEnvironmentIsSound();
  if (environmentProblem) {
    console.error('[passes/checkout] Configuration de paiement inutilisable :', environmentProblem);
    return NextResponse.json({ error: 'Le paiement Mobile Money n’est pas encore disponible.' }, { status: 503 });
  }

  const checkoutId = randomUUID();
  const currency = corridor.corridor.currency;

  /*
   * Le `slug` ne sert qu'à la navigation de retour : il n'influence ni le prix,
   * ni la durée, ni l'activation. On le valide comme un identifiant d'adresse
   * avant de le replacer dans une URL — jamais de valeur brute dans un lien.
   */
  const returnSlug =
    typeof body.slug === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(body.slug) ? body.slug : null;
  const returnUrl = `${SITE_URL}/pass/retour?checkoutId=${checkoutId}${
    returnSlug ? `&campaign=${returnSlug}` : ''
  }`;

  /*
   * L'intention est écrite **avant** l'appel réseau : si pawaPay refuse, la
   * trace existe en base et le support peut la retrouver.
   */
  const { error: insertError } = await admin.from('watermark_pass_orders').insert({
    browser_id: browserId,
    ua_hash: uaHash,
    provider: 'pawapay',
    checkout_id: checkoutId,
    duration_h: PASS_DURATION_HOURS,
    amount: PASS_PRICE_XOF,
    currency,
    country: corridor.corridor.countryCode,
    status: 'pending',
  });

  if (insertError) {
    console.error('[passes/checkout] Insertion impossible :', insertError.message);
    return NextResponse.json({ error: 'Le paiement n’a pas pu être enregistré.' }, { status: 500 });
  }

  let redirectUrl: string;
  try {
    const created = await createCheckout({
      checkoutId,
      returnUrl,
      countryCode: corridor.corridor.countryCode,
      currency,
      amount: PASS_PRICE_XOF,
      durationHours: PASS_DURATION_HOURS,
    });
    redirectUrl = created.redirectUrl;
  } catch (error) {
    console.error('[passes/checkout] Refus pawaPay :', error);
    await admin
      .from('watermark_pass_orders')
      .update({
        status: 'failed',
        failure_code: 'INIT_FAILED',
        failure_message: error instanceof Error ? error.message : 'Échec d’initialisation.',
        updated_at: new Date().toISOString(),
      })
      .eq('checkout_id', checkoutId);
    return NextResponse.json({ error: 'Le paiement est momentanément indisponible.' }, { status: 502 });
  }

  const response = NextResponse.json({ redirectUrl, checkoutId });
  if (!existingBid) {
    response.cookies.set(PASS_COOKIE, browserId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: PASS_COOKIE_MAX_AGE,
    });
  }
  return response;
}
