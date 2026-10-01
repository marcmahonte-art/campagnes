import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/backend/config';

/**
 * Client Supabase **sans cookie**, réservé aux lectures publiques côté serveur.
 *
 * Pourquoi un troisième client, alors que `client.ts` et `server.ts` existent :
 *
 * - `client.ts` s'exécute dans le navigateur. Il ne peut pas alimenter les
 *   balises Open Graph, que les robots des réseaux sociaux lisent **avant**
 *   qu'un seul octet de JavaScript ne soit exécuté.
 * - `server.ts` lit les cookies pour reconstituer une session. Un aperçu de
 *   partage est par définition anonyme : le robot de WhatsApp n'a pas de
 *   session, et l'ouvrir ici ferait entrer la page dans le rendu dynamique
 *   pour rien.
 *
 * Ce client parle donc en `anon`, sous RLS, sans identité. Il ne peut lire que
 * ce qu'un visiteur anonyme peut déjà lire — les campagnes publiées et la vue
 * publique des créateurs. Il n'a ni session persistée ni jeton à rafraîchir :
 * rien à écrire, rien à fuiter.
 */
export function supabasePublic() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
