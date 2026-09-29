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

/**
 * Vrai si le compte peut changer lui-même sa formule.
 *
 * Uniquement en mode démonstration : sans base ni prestataire de paiement,
 * c'est le seul moyen de parcourir les modules premium.
 *
 * Dès que Supabase est branché, la formule ne s'écrit plus depuis le
 * navigateur (migration 0005). Les écrans doivent donc consulter ce drapeau
 * au lieu de supposer qu'un bouton d'activation est légitime — sans quoi un
 * compte Free pourrait s'ouvrir tous les modules premium en un clic, et les
 * verrous posés ailleurs ne serviraient à rien.
 */
export const canSelfActivatePlan = isDemoMode;

export { isSupabaseConfigured } from './config';
export type {
  Backend,
  BackendMode,
  CreateCampaignInput,
  Result,
  SignUpOutcome,
  UpdateProfilePatch,
} from './types';
