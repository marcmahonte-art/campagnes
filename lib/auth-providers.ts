import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/backend/config';

/**
 * Fournisseurs d'authentification réellement activés sur le projet Supabase.
 *
 * Pourquoi interroger le serveur plutôt que de se fier à la configuration
 * locale : le bouton « Continuer avec Google » s'affichait dès que Supabase
 * était configuré, alors que le fournisseur Google était désactivé côté projet.
 * Le clic éjectait le visiteur hors de l'application, sur une réponse JSON brute
 * de Supabase (`Unsupported provider: provider is not enabled`), sans aucun
 * chemin de retour. On n'affiche donc que ce qui fonctionne.
 *
 * `GET /auth/v1/settings` est un endpoint public : il ne demande que la clé
 * anonyme, déjà présente dans le bundle.
 */
export interface AuthProviders {
  email: boolean;
  google: boolean;
}

/** Repli prudent : en cas de doute on n'affiche pas Google. */
const FALLBACK: AuthProviders = { email: true, google: false };

let cache: Promise<AuthProviders> | null = null;

export function fetchAuthProviders(): Promise<AuthProviders> {
  if (!isSupabaseConfigured) return Promise.resolve(FALLBACK);

  if (!cache) {
    cache = fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((settings: { external?: Record<string, boolean> } | null) => {
        if (!settings?.external) return FALLBACK;
        return {
          email: Boolean(settings.external.email),
          google: Boolean(settings.external.google),
        };
      })
      .catch(() => FALLBACK);
  }

  return cache;
}
