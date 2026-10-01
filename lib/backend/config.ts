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

/**
 * URL publique du site.
 *
 * `NEXT_PUBLIC_SITE_URL` fait foi. À défaut, on retombe sur l'adresse de
 * déploiement exposée par Vercel : une variable oubliée donnerait sinon des
 * liens de partage et des URL canoniques en `http://localhost:3000` — invisibles
 * en développement, et inutilisables une fois en ligne.
 *
 * Le dernier repli reste `localhost`, pour que le mode démonstration fonctionne
 * sans aucune configuration.
 */
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();

export const SITE_URL =
  configuredSiteUrl || (vercelUrl ? `https://${vercelUrl}` : '') || 'http://localhost:3000';

export const MEDIA_BUCKET = 'media';

/**
 * Espace des pièces jointes de signalement.
 *
 * Volontairement **privé** et distinct de `media` : un signalement peut contenir
 * une capture d'écran litigieuse, qui n'a aucune raison d'être servie
 * publiquement. Seule l'équipe y accède.
 */
export const REPORTS_BUCKET = 'reports';
