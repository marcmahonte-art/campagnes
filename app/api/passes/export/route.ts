import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabasePublic } from '@/lib/supabase/public';
import { isSupabaseConfigured } from '@/lib/backend/config';
import { PASS_COOKIE, getActivePass, hashUserAgent } from '@/lib/watermark-pass';
import { parseDescriptor } from '@/lib/descriptor';
import {
  composeDescriptor,
  type ParticipantPhoto,
  type ParticipantStyle,
  type PhotoPlacement,
} from '@/lib/participant';
import { ensureServerRenderRuntime } from '@/lib/render/server-runtime';
import { exportPng } from '@/lib/video-export';

/**
 * Export PNG **serveur** du parcours participant, réservé aux détenteurs d'un
 * pass actif.
 *
 * C'est le point qui rend le pass défendable : la décision du filigrane et le
 * dessin du badge se font **hors du navigateur**. Le client ne peut pas retirer
 * le badge depuis les DevTools, puisqu'il ne produit plus l'image.
 *
 * Ce que la route refuse :
 *   - un appel sans pass actif (403) — elle n'est pas un service de rendu
 *     générique ;
 *   - une campagne inconnue ou non publiée (404) ;
 *   - un rendu si `fabric/node` n'est pas disponible (503) plutôt qu'une image
 *     qui ne correspondrait pas à l'aperçu.
 *
 * Le cadre est chargé **depuis la base**, jamais reçu du client : le client ne
 * fournit que ce qui lui appartient (sa photo, son placement, son style).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Garde-fou de taille : une photo en data URL reste sous ~9 Mo. */
const MAX_PHOTO_CHARS = 12_000_000;

interface ExportBody {
  slug?: string;
  photo?: { src?: string; naturalWidth?: number; naturalHeight?: number };
  placement?: { zoom?: number; x?: number; y?: number };
  style?: { filter?: string; text?: unknown };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as ExportBody;

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!slug) {
    return NextResponse.json({ error: 'Campagne manquante.' }, { status: 400 });
  }

  const photo = body.photo;
  if (
    !photo ||
    typeof photo.src !== 'string' ||
    !photo.src.startsWith('data:image/') ||
    photo.src.length > MAX_PHOTO_CHARS ||
    !isFiniteNumber(photo.naturalWidth) ||
    !isFiniteNumber(photo.naturalHeight) ||
    photo.naturalWidth <= 0 ||
    photo.naturalHeight <= 0
  ) {
    return NextResponse.json({ error: 'Photo invalide.' }, { status: 400 });
  }

  const placement = body.placement;
  if (
    !placement ||
    !isFiniteNumber(placement.zoom) ||
    !isFiniteNumber(placement.x) ||
    !isFiniteNumber(placement.y)
  ) {
    return NextResponse.json({ error: 'Placement invalide.' }, { status: 400 });
  }

  // 1. Le pass doit être actif pour CE navigateur.
  const browserId = request.cookies.get(PASS_COOKIE)?.value;
  const userAgent = request.headers.get('user-agent') ?? '';

  if (!isSupabaseConfigured || !browserId) {
    return NextResponse.json({ error: 'Aucun pass actif.' }, { status: 403 });
  }

  const pass = await getActivePass(supabaseAdmin(), browserId, hashUserAgent(userAgent));
  if (!pass) {
    return NextResponse.json({ error: 'Aucun pass actif.' }, { status: 403 });
  }

  // 2. Le cadre vient de la base, jamais du client.
  const publicClient = supabasePublic();
  const { data: campaignRow } = await publicClient
    .from('campaigns')
    .select('id, frame_id, status')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  const campaignId = (campaignRow as { id?: string } | null)?.id;
  const frameId = (campaignRow as { frame_id?: string } | null)?.frame_id;
  if (!campaignId || !frameId) {
    return NextResponse.json({ error: 'Campagne introuvable.' }, { status: 404 });
  }

  const { data: frameRow } = await publicClient
    .from('frames')
    .select('descriptor_json')
    .eq('id', frameId)
    .maybeSingle();

  const rawDescriptor = (frameRow as { descriptor_json?: unknown } | null)?.descriptor_json;
  if (rawDescriptor === undefined || rawDescriptor === null) {
    return NextResponse.json({ error: 'Cadre introuvable.' }, { status: 404 });
  }

  const descriptor =
    typeof rawDescriptor === 'string' ? parseDescriptor(JSON.parse(rawDescriptor)) : parseDescriptor(rawDescriptor);

  /*
   * 3. Réserver une unité de quota — **la même règle que le parcours public**.
   *
   * C'est indispensable : sans cette réservation, un détenteur de pass pourrait
   * contourner la limite de la campagne en appelant cette route directement. Le
   * pass retire le filigrane ; il n'ouvre pas un téléchargement illimité. On
   * appelle la fonction SQL telle quelle — elle verrouille la ligne, donc deux
   * exports simultanés ne peuvent pas prendre deux fois la dernière place.
   */
  const { data: claim, error: claimError } = await publicClient.rpc('claim_participation', {
    p_campaign_id: campaignId,
  });

  if (claimError) {
    console.error('[passes/export] Réservation de quota impossible :', claimError.message);
    return NextResponse.json({ error: 'Le rendu a échoué.' }, { status: 500 });
  }

  const claimRow = (Array.isArray(claim) ? claim[0] : claim) as
    | { granted?: boolean; used?: number; quota?: number }
    | null
    | undefined;

  if (!claimRow?.granted) {
    return NextResponse.json(
      { error: 'La campagne a atteint sa limite.', code: 'PASS_QUOTA_CLOSED' },
      { status: 403 },
    );
  }

  // 4. Composition partagée avec l'aperçu — même code, donc même rendu.
  const participantPhoto: ParticipantPhoto = {
    src: photo.src,
    naturalWidth: photo.naturalWidth,
    naturalHeight: photo.naturalHeight,
  };
  const safePlacement: PhotoPlacement = {
    zoom: placement.zoom,
    x: placement.x,
    y: placement.y,
  };
  const style: ParticipantStyle = {
    filter: (body.style?.filter as ParticipantStyle['filter']) ?? 'none',
    text: (body.style?.text as ParticipantStyle['text']) ?? null,
  };

  const composed = composeDescriptor(descriptor, participantPhoto, safePlacement, style);

  // 4. Rendu serveur. `creator` = pas de badge (le pass l'autorise).
  if (!(await ensureServerRenderRuntime())) {
    return NextResponse.json({ error: 'Rendu indisponible.' }, { status: 503 });
  }

  try {
    const dataUrl = await exportPng({ descriptor: composed, plan: 'creator' });
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const buffer = Buffer.from(base64, 'base64');

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        // Quota mis à jour, pour que l'écran reste juste sans second aller-retour.
        'X-Quota-Used': String(claimRow.used ?? ''),
        'X-Quota-Total': String(claimRow.quota ?? ''),
      },
    });
  } catch (error) {
    console.error('[passes/export] Rendu impossible :', error);
    return NextResponse.json({ error: 'Le rendu a échoué.' }, { status: 500 });
  }
}
