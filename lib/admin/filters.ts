/**
 * Filtres et bornes du Super Admin — **module client-safe**.
 *
 * Une période ou une page vit dans l'URL : les composants clients doivent
 * pouvoir les normaliser pour construire leurs requêtes, sans importer la
 * couche d'accès aux données. Mélanger les deux entraînait le client
 * `service_role` dans le bundle navigateur.
 *
 * Les valeurs hostiles sont ramenées à une valeur sûre, jamais rejetées :
 * un paramètre d'URL n'est pas un formulaire, il n'y a personne à qui
 * expliquer l'erreur.
 */

export const ADMIN_PERIODS = ['7d', '30d', '90d'] as const;
export type AdminPeriod = (typeof ADMIN_PERIODS)[number];

export const ADMIN_PERIOD_LABELS: Record<AdminPeriod, string> = {
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
  '90d': '90 derniers jours',
};

export const ADMIN_PAGE_SIZE = 25;

/**
 * Plafond d'un export CSV.
 *
 * Un export n'est pas une sauvegarde : il sort des données personnelles dans
 * un fichier qui vivra hors de la base. Le borner évite qu'un filtre trop
 * large vide la table d'un coup ; au-delà, il faudra un export différé.
 */
export const EXPORT_ROW_LIMIT = 2000;

export function normalizePeriod(value: string | null | undefined): AdminPeriod {
  return value === '7d' || value === '30d' || value === '90d' ? value : '30d';
}

export function periodStart(period: AdminPeriod): string {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function normalizePage(value: string | number | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? 1), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 1000);
}

export function normalizeText(value: string | null | undefined, max = 80): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Découpe une période en jours, pour les courbes. */
export function dailyBuckets(period: AdminPeriod): string[] {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const out: string[] = [];
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    out.push(day.toISOString().slice(0, 10));
  }
  return out;
}
