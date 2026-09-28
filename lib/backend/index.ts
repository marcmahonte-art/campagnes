import { isSupabaseConfigured } from './config';
import { localBackend } from './local';
import { supabaseBackend } from './supabase';
import type { Backend } from './types';

/**
 * Façade unique de la couche données.
 *
 * Toute l'application importe `backend` depuis ce module — jamais une
 * implémentation en particulier. Brancher Supabase ne demande donc aucune
 * modification d'écran : il suffit de renseigner `.env.local`.
 */
export const backend: Backend = isSupabaseConfigured ? supabaseBackend : localBackend;

export const backendMode = backend.mode;

/** Vrai si l'app tourne sur le repli de démonstration (bandeau discret). */
export const isDemoMode = backend.mode === 'local';

export { isSupabaseConfigured } from './config';
export type {
  Backend,
  BackendMode,
  CreateCampaignInput,
  Result,
  SignUpOutcome,
  UpdateProfilePatch,
} from './types';
