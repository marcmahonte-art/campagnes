import { NextResponse, type NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

/**
 * Deux responsabilités :
 *
 * 1. `campagnes.app/@pseudo` → `/u/pseudo`
 *    En App Router, un dossier nommé `@pseudo` serait interprété comme un slot de
 *    route parallèle. On garde donc `/u/[username]` comme route canonique et on
 *    réécrit l'URL publique promise au créateur.
 *
 * 2. Rafraîchissement de la session Supabase (le token est renouvelé sur chaque
 *    navigation pour éviter les déconnexions silencieuses).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. /@pseudo → /u/pseudo
  if (pathname.startsWith('/@')) {
    const username = pathname.slice(2).replace(/\/+$/, '');
    if (username) {
      const url = request.nextUrl.clone();
      url.pathname = `/u/${username}`;
      return NextResponse.rewrite(url);
    }
  }

  // 2. Session Supabase — uniquement si le projet est configuré.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const { createServerClient } = await import('@supabase/ssr');
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
