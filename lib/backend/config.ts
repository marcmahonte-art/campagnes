/**
 * Détection du mode de données.
 *
 * - Les deux variables sont présentes → mode Supabase (Auth + Postgres + RLS + Storage).
 * - Sinon → mode local de démonstration, pour que le parcours Phase A soit
 *   parcourable sans provisionner de projet.
 *
 * Aucun écran ne teste ce flag : seule la façade `lib/backend/index.ts` s'en sert.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000';

export const MEDIA_BUCKET = 'media';
