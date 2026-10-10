import { NextResponse, type NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

/**
 * Les hôtes que le détourage sur l'appareil doit joindre.
 *
 * Sans eux, la CSP fait échouer le détourage **avant** toute question de réseau :
 * `loadMediapipe()` et `loadTransformers()` font un `import()` d'une URL sur
 * `cdn.jsdelivr.net` — refusé par `script-src` — et le WASM ainsi que les poids
 * sont récupérés par `fetch` — refusé par `connect-src`. Le participant, lui,
 * voyait « le modèle n'a pas pu être téléchargé », c'est-à-dire un message
 * exact pour une cause fausse.
 *
 * La liste est **écrite ici en clair et non importée** de `lib/cutout.ts` : ce
 * fichier tourne dans le middleware (runtime Edge) et l'y importer traînerait
 * des symboles navigateur. Elle est courte, fermée, et chacun de ces hôtes est
 * justifié par une entrée `hosts` du registre `CUTOUT_MODELS`.
 *
 * `wss:` est nécessaire pour MediaPipe, qui ouvre une connexion WebSocket vers
 * son CDN lors de l'initialisation du graphe.
 */
const CUTOUT_HOSTS = [
  'https://cdn.jsdelivr.net', // @mediapipe/tasks-vision, @huggingface/transformers
  'https://storage.googleapis.com', // selfie_segmenter.tflite (modèle MediaPipe)
  'https://huggingface.co', // MODNet, RMBG-1.4 (poids)
  'https://cdn-lfs.huggingface.co', // les mêmes poids, servis par le CDN LFS
];

/**
 * Les polices que le participant peut poser sur son texte.
 *
 * Elles sont chargées côté client par une balise `<link>` vers
 * `fonts.googleapis.com` (`components/participant/participant-stage.tsx`), pour
 * une raison précise : la police est choisie **après** le rendu, dans le
 * panneau de réglages, donc `next/font` — qui fige les polices au build — ne
 * peut pas les fournir. Sans ces deux hôtes, une police choisie par le
 * participant ne s'applique jamais : le texte retombe silencieusement sur la
 * police par défaut.
 *
 * `fonts.gstatic.com` sert les fichiers eux-mêmes, `fonts.googleapis.com` la
 * feuille de style. Les deux sont nécessaires ; n'en autoriser qu'un donnerait
 * une feuille de style dont les fichiers de police restent bloqués.
 */
const FONT_HOSTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

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
    /*
     * CSP. Les hôtes du détourage sont autorisés **nommément** et non par un
     * joker : le participant exécute du script tiers dans la page qui porte sa
     * photo, la moindre ouverture en trop y est une porte. `wasm-unsafe-eval`
     * est requis par WebAssembly, sans qui aucun des deux moteurs ne démarre ;
     * il est plus étroit que `unsafe-eval`, déjà présent pour Next.js.
     *
     * **`odml.pa.googleapis.com` est volontairement ABSENT.** MediaPipe y envoie
     * de la télémétrie d'usage (« odml » = On-Device Machine Learning). Laisser
     * cette connexion passer contredirait la promesse affichée au participant —
     * « votre photo est traitée sur votre appareil ». Le refus est donc le
     * comportement voulu, et il n'empêche rien : le moteur démarre, détoure et
     * rend son verdict sans ce journal. C'est une **décision de confidentialité
     * inscrite dans l'en-tête**, pas un oubli.
     */
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${CUTOUT_HOSTS.join(' ')}`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob: https:",
        `font-src 'self' data: ${FONT_HOSTS.join(' ')}`,
        `connect-src 'self' https://*.supabase.co https://*.supabase.in ${CUTOUT_HOSTS.join(' ')} wss://cdn.jsdelivr.net`,
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

  /*
   * L'espace d'administration n'a aucune raison d'être découvrable : un outil
   * interne indexé devient une cible, et un moteur qui l'annonce laisse croire
   * qu'il est public. L'en-tête le sort de l'indexation même si une page
   * oubliait ses métadonnées.
   */
  if (pathname.startsWith('/super-admin') || pathname.startsWith('/api/admin/')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
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
