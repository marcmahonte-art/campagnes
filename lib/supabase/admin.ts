import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/backend/config';

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

let adminClient: SupabaseClient | null = null;

/**
 * Client Supabase avec privilèges `service_role`.
 * Réservé exclusivement aux endpoints API côté serveur (Webhooks, tâches de fond, administration).
 * NE JAMAIS importer ou exécuter ce client dans du code client (navigateur) !
 */
export function supabaseAdmin(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant. Configurez ces variables côté serveur.',
    );
  }

  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return adminClient;
}
