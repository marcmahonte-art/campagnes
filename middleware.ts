import { NextResponse, type NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

/**
 * Sécurité + session Supabase :
 *
 * 1. En-têtes de sécurité (HSTS, CSP, X-Frame-Options, X-Content-Type-Options,
 *    Referrer-Policy, Permissions-Policy) sur toutes les réponses HTML.
 * 2. `/@pseudo` → `/u/pseudo` (rewrite).
 * 3. Rafraîchissement de session Supabase.
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

  let response = NextResponse.next({ request });

  // 2. En-têtes de sécurité (sur toutes les réponses HTML)
  const isHtml =
    request.headers.get('accept')?.includes('text/html') ||
    pathname === '/' ||
    pathname.startsWith('/u/') ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/d/');
  if (isHtml) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    // CSP stricte : scripts/style autorisés uniquement inline (Next.js) + self
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://*.supabase.co https://*.supabase.in",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
  }

  if (pathname.startsWith('/d/')) {
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  // 3. Session Supabase — uniquement si le projet est configuré.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  let sessionResponse = response;
  const { createServerClient } = await import('@supabase/ssr');
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        sessionResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          sessionResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();
  // setAll reconstruit la réponse : recopier les protections après le renouvellement.
  response.headers.forEach((value, key) => sessionResponse.headers.set(key, value));
  if (pathname.startsWith('/d/')) {
    sessionResponse.headers.set('Referrer-Policy', 'no-referrer');
    sessionResponse.headers.set('Cache-Control', 'private, no-store, max-age=0');
    sessionResponse.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  return sessionResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
