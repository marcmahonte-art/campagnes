import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/backend/config';

/**
 * Échange le code OAuth (Google) contre une session, puis redirige.
 * Sans Supabase configuré, la route renvoie simplement vers l'accueil.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const requested = searchParams.get('next') ?? '/onboarding';
  // Chemin interne uniquement : un `next` absolu ferait de ce callback un tremplin.
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/onboarding';

  if (!isSupabaseConfigured || !code) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/onboarding'}`);
}
