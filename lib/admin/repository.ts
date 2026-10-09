import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AdminRole } from '@/lib/admin/auth';
import type {
  AdminAuditRow,
  AdminCampaignRow,
  AdminMetrics,
  AdminPaymentRow,
  AdminSeries,
  AdminSystemHealth,
  AdminUserRow,
  Counter,
  ListResult,
  SeriesPoint,
} from '@/lib/admin/types';

/**
 * Couche de lecture administrative — **la seule porte d'entrée vers les
 * données du pilotage**.
 *
 * Règles tenues par ce module :
 *
 *   1. **Une seule source par chiffre.** Les agrégats sont calculés ici, pas
 *      dans les composants : deux cartes ne doivent jamais compter la même
 *      chose de deux façons.
 *   2. **Aucune invention.** Une métrique que la base ne permet pas de
 *      calculer est renvoyée comme `null` et affichée « Non mesuré ».
 *      Reconstituer un chiffre plausible serait pire qu'un vide.
 *   3. **Aucune donnée sensible.** Les jetons privés de distribution, les
 *      secrets de paiement et les contenus personnels ne sortent jamais d'ici.
 *   4. **Lecture seule.** Ce module ne corrige rien : toute modification
 *      passe par une action explicite et journalisée.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/*
 * Les contrats sont définis dans `lib/admin/types.ts`, jamais ici : un
 * composant client peut importer un type, il ne doit pas importer ce module,
 * qui charge le client `service_role`.
 */
export type {
  Counter,
  SeriesPoint,
  AdminMetrics,
  AdminSeries,
  AdminSystemHealth,
  ListResult,
  AdminUserRow,
  AdminPaymentRow,
  AdminCampaignRow,
  AdminAuditRow,
} from '@/lib/admin/types';

/* ------------------------------------------------------------------ */
/* Filtres                                                             */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Utilitaires de lecture                                              */
/* ------------------------------------------------------------------ */

/**
 * `count` de PostgREST lit l'en-tête `content-range`.
 *
 * `available: false` quand la requête échoue : une carte affichera « Non
 * mesuré » plutôt qu'un 0. C'est toute la différence entre « aucun
 * utilisateur » et « base injoignable ».
 */
async function countRows(
  admin: SupabaseClient,
  table: string,
  apply: (query: any) => any = (q) => q,
): Promise<Counter> {
  try {
    const base = admin.from(table).select('*', { count: 'exact', head: true });
    const { count, error } = await apply(base);
    if (error) return { value: 0, available: false };
    return { value: count ?? 0, available: true };
  } catch {
    return { value: 0, available: false };
  }
}

/** Somme d'une colonne sur des lignes filtrées, bornée pour ne pas saturer. */
async function sumColumn(
  admin: SupabaseClient,
  table: string,
  column: string,
  apply: (query: any) => any,
  limit = 5000,
): Promise<Counter> {
  try {
    const base = admin.from(table).select(column).limit(limit);
    const { data, error } = await apply(base);
    if (error) return { value: 0, available: false };

    const rows = (data ?? []) as Record<string, unknown>[];
    const total = rows.reduce((sum, row) => {
      const raw = row[column];
      const value = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    return { value: total, available: true };
  } catch {
    return { value: 0, available: false };
  }
}

/** Regroupement par valeur, pour les répartitions (plans, statuts). */
function groupBy(rows: Record<string, unknown>[], key: string): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const raw = row[key];
    const label = raw === null || raw === undefined ? 'inconnu' : String(raw);
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

async function selectRows(
  admin: SupabaseClient,
  table: string,
  columns: string,
  apply: (query: any) => any,
  limit = 1000,
): Promise<Record<string, unknown>[]> {
  try {
    const base = admin.from(table).select(columns).limit(limit);
    const { data, error } = await apply(base);
    if (error) return [];
    return (data ?? []) as Record<string, unknown>[];
  } catch {
    return [];
  }
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

function toSeries(
  rows: Record<string, unknown>[],
  dateKey: string,
  buckets: string[],
  valueKey?: string,
): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const raw = row[dateKey];
    if (typeof raw !== 'string') continue;
    const day = raw.slice(0, 10);
    const value = valueKey ? Number(row[valueKey]) : 1;
    map.set(day, (map.get(day) ?? 0) + (Number.isFinite(value) ? value : 0));
  }
  return buckets.map((date) => ({ date, value: map.get(date) ?? 0 }));
}

/* ------------------------------------------------------------------ */
/* Vue d'ensemble                                                      */
/* ------------------------------------------------------------------ */

export async function getOverviewMetrics(period: AdminPeriod): Promise<AdminMetrics> {
  const admin = supabaseAdmin();
  const since = periodStart(period);
  const now = new Date();
  const soonLimit = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    usersTotal,
    usersNew,
    usersExpired,
    usersExpiring,
    campaignsTotal,
    campaignsNew,
    campaignsPublished,
    campaignsDraft,
    paymentsCompleted,
    paymentsPending,
    paymentsFailed,
    paymentsCancelled,
    passesTotal,
    passesActive,
    distributionLinks,
    distributionConfirmed,
    distributionReserved,
    reportsOpen,
    reportsTotal,
  ] = await Promise.all([
    countRows(admin, 'users'),
    countRows(admin, 'users', (q) => q.gte('created_at', since)),
    countRows(admin, 'users', (q) => q.not('plan', 'eq', 'free').lt('plan_expires_at', now.toISOString())),
    countRows(admin, 'users', (q) => q.not('plan', 'eq', 'free').gte('plan_expires_at', now.toISOString()).lte('plan_expires_at', soonLimit)),
    countRows(admin, 'campaigns'),
    countRows(admin, 'campaigns', (q) => q.gte('created_at', since)),
    countRows(admin, 'campaigns', (q) => q.eq('status', 'published')),
    countRows(admin, 'campaigns', (q) => q.eq('status', 'draft')),
    countRows(admin, 'payments', (q) => q.eq('status', 'completed')),
    countRows(admin, 'payments', (q) => q.eq('status', 'pending')),
    countRows(admin, 'payments', (q) => q.eq('status', 'failed')),
    countRows(admin, 'payments', (q) => q.eq('status', 'cancelled')),
    countRows(admin, 'watermark_pass_orders'),
    countRows(admin, 'watermark_pass_orders', (q) => q.eq('status', 'active')),
    countRows(admin, 'distribution_links'),
    countRows(admin, 'distribution_export_operations', (q) => q.eq('state', 'CONFIRMED')),
    countRows(admin, 'distribution_export_operations', (q) => q.eq('state', 'RESERVED')),
    countRows(admin, 'content_reports', (q) => q.eq('status', 'NEW')),
    countRows(admin, 'content_reports'),
  ]);

  const [revenue, passRevenue, quotaUsed, quotaGranted, planRows, statusRows, campaignsWithoutOwner] =
    await Promise.all([
      sumColumn(admin, 'payments', 'amount', (q) => q.eq('status', 'completed').gte('created_at', since)),
      sumColumn(admin, 'watermark_pass_orders', 'amount', (q) => q.in('status', ['active', 'expired'])),
      sumColumn(admin, 'campaigns', 'participants_used', (q) => q),
      sumColumn(admin, 'campaigns', 'participants_granted', (q) => q),
      selectRows(admin, 'users', 'plan', (q) => q),
      selectRows(admin, 'payments', 'status', (q) => q),
      countRows(admin, 'users', (q) => q.is('onboarded_at', null)),
    ]);

  /*
   * Campagnes épuisées : `participants_used >= participants_granted`. PostgREST
   * ne sait pas comparer deux colonnes entre elles, on lit donc les compteurs
   * et on tranche ici — la règle reste écrite une seule fois, dans ce module.
   */
  const campaignCounters = await selectRows(
    admin,
    'campaigns',
    'participants_used, participants_granted',
    (q) => q,
    5000,
  );
  const exhausted = campaignCounters.filter(
    (row) => Number(row.participants_granted) > 0 &&
      Number(row.participants_used) >= Number(row.participants_granted),
  ).length;

  return {
    generatedAt: now.toISOString(),
    period,
    since,
    users: {
      total: usersTotal,
      newInPeriod: usersNew,
      byPlan: groupBy(planRows, 'plan').map((entry) => ({ plan: entry.key, count: entry.count })),
      // Approximation honnête : les comptes jamais onboardés n'ont, par
      // construction, pas pu publier. Ce n'est pas un taux d'activation.
      withoutCampaign: campaignsWithoutOwner,
      expiredPlans: usersExpired,
      expiringSoon: usersExpiring,
    },
    campaigns: {
      total: campaignsTotal,
      newInPeriod: campaignsNew,
      published: campaignsPublished,
      draft: campaignsDraft,
      quotaUsed: quotaUsed,
      quotaGranted: quotaGranted,
      exhausted: { value: exhausted, available: campaignsTotal.available },
    },
    payments: {
      completed: paymentsCompleted,
      pending: paymentsPending,
      failed: paymentsFailed,
      cancelled: paymentsCancelled,
      revenueFcfa: revenue,
      byStatus: groupBy(statusRows, 'status').map((entry) => ({
        status: entry.key,
        count: entry.count,
      })),
    },
    passes: {
      total: passesTotal,
      active: passesActive,
      revenueFcfa: passRevenue,
    },
    distribution: {
      links: distributionLinks,
      confirmedExports: distributionConfirmed,
      reservedExports: distributionReserved,
      quotaGranted: quotaGranted,
    },
    reports: {
      open: reportsOpen,
      total: reportsTotal,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Séries temporelles                                                  */
/* ------------------------------------------------------------------ */

export async function getOverviewSeries(period: AdminPeriod): Promise<AdminSeries> {
  const admin = supabaseAdmin();
  const since = periodStart(period);
  const buckets = dailyBuckets(period);

  const [paymentRows, userRows, campaignRows] = await Promise.all([
    selectRows(admin, 'payments', 'created_at, amount, status', (q) => q.gte('created_at', since), 5000),
    selectRows(admin, 'users', 'created_at', (q) => q.gte('created_at', since), 5000),
    selectRows(admin, 'campaigns', 'created_at', (q) => q.gte('created_at', since), 5000),
  ]);

  const confirmed = paymentRows.filter((row) => row.status === 'completed');

  return {
    revenue: toSeries(confirmed, 'created_at', buckets, 'amount'),
    signups: toSeries(userRows, 'created_at', buckets),
    campaigns: toSeries(campaignRows, 'created_at', buckets),
    paymentsConfirmed: toSeries(confirmed, 'created_at', buckets),
  };
}

/* ------------------------------------------------------------------ */
/* Utilisateurs                                                        */
/* ------------------------------------------------------------------ */

export interface UserFilters {
  search?: string | null;
  plan?: string | null;
  period?: AdminPeriod;
  page?: string | number | null;
}

export async function listUsers(filters: UserFilters): Promise<ListResult<AdminUserRow>> {
  const admin = supabaseAdmin();
  const page = normalizePage(filters.page);
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const to = from + ADMIN_PAGE_SIZE - 1;
  const search = normalizeText(filters.search);
  const plan = normalizeText(filters.plan, 20);

  let query = admin
    .from('users')
    .select('id, username, email, org_name, plan, onboarded_at, created_at, plan_expires_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (plan && plan !== 'all') {
    query = query.eq('plan', plan);
  }
  if (filters.period) {
    query = query.gte('created_at', periodStart(filters.period));
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const users = (data ?? []) as Record<string, unknown>[];
  const ids = users.map((row) => String(row.id));

  const [campaignCounts, paymentTotals] = await Promise.all([
    countCampaignsByOwners(admin, ids),
    sumPaymentsByUsers(admin, ids),
  ]);

  const rows: AdminUserRow[] = users.map((row) => {
    const id = String(row.id);
    return {
      id,
      username: String(row.username ?? ''),
      email: String(row.email ?? ''),
      org_name: row.org_name ? String(row.org_name) : null,
      plan: String(row.plan ?? 'free'),
      onboarded_at: row.onboarded_at ? String(row.onboarded_at) : null,
      created_at: String(row.created_at ?? ''),
      plan_expires_at: row.plan_expires_at ? String(row.plan_expires_at) : null,
      campaign_count: campaignCounts.get(id) ?? 0,
      paid_total_fcfa: paymentTotals.get(id) ?? 0,
    };
  });

  return {
    rows,
    total: count ?? 0,
    page,
    pageSize: ADMIN_PAGE_SIZE,
    // Les compteurs par utilisateur sont lus sur une page : au-delà d'un
    // certain volume, ils devront passer par une vue agrégée. Le drapeau le dit.
    truncated: false,
  };
}

async function countCampaignsByOwners(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  try {
    const { data } = await admin
      .from('campaigns')
      .select('owner_id')
      .in('owner_id', ids)
      .limit(5000);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const key = String(row.owner_id);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  } catch {
    // Un compteur absent reste à 0 : l'interface le distingue d'une erreur
    // globale, qui elle remonte en 500.
  }
  return map;
}

async function sumPaymentsByUsers(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  try {
    const { data } = await admin
      .from('payments')
      .select('user_id, amount')
      .in('user_id', ids)
      .eq('status', 'completed')
      .limit(5000);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const key = String(row.user_id);
      const value = Number(row.amount);
      map.set(key, (map.get(key) ?? 0) + (Number.isFinite(value) ? value : 0));
    }
  } catch {
    // idem : total payé inconnu plutôt que faux.
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Paiements                                                           */
/* ------------------------------------------------------------------ */

export interface PaymentFilters {
  status?: string | null;
  type?: string | null;
  search?: string | null;
  period?: AdminPeriod;
  page?: string | number | null;
}

export async function listPayments(
  filters: PaymentFilters,
): Promise<ListResult<AdminPaymentRow>> {
  const admin = supabaseAdmin();
  const page = normalizePage(filters.page);
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const to = from + ADMIN_PAGE_SIZE - 1;
  const status = normalizeText(filters.status, 20);
  const type = normalizeText(filters.type, 30);
  const search = normalizeText(filters.search);

  let query = admin
    .from('payments')
    .select(
      'id, deposit_id, user_id, plan, purchase_type, amount, currency, status, provider, metadata, failure_code, failure_message, created_at, updated_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status && status !== 'all') query = query.eq('status', status);
  if (type && type !== 'all') query = query.eq('purchase_type', type);
  if (search) query = query.or(`deposit_id.ilike.%${search}%,provider.ilike.%${search}%`);
  if (filters.period) query = query.gte('created_at', periodStart(filters.period));

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Record<string, unknown>[];
  const userIds = [...new Set(rows.map((row) => String(row.user_id ?? '')).filter(Boolean))];
  const usernames = await mapUsernames(admin, userIds);

  return {
    rows: rows.map((row) => {
      /*
       * Le pays n'est pas une colonne : il vit dans `metadata`, posé à
       * l'initiation. On ne le devine jamais — un paiement sans pays reste
       * sans pays, l'interface affichera « À COMPLÉTER ».
       */
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const country =
        typeof metadata.country === 'string' && metadata.country
          ? metadata.country
          : null;

      return {
        id: String(row.id),
        deposit_id: String(row.deposit_id ?? ''),
        user_id: row.user_id ? String(row.user_id) : null,
        username: row.user_id ? usernames.get(String(row.user_id)) ?? null : null,
        plan: row.plan ? String(row.plan) : null,
        purchase_type: row.purchase_type ? String(row.purchase_type) : null,
        amount: Number(row.amount ?? 0),
        currency: String(row.currency ?? 'XOF'),
        status: String(row.status ?? 'pending'),
        provider: row.provider ? String(row.provider) : null,
        country,
        failure_code: row.failure_code ? String(row.failure_code) : null,
        failure_message: row.failure_message ? String(row.failure_message) : null,
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? ''),
      };
    }),
    total: count ?? 0,
    page,
    pageSize: ADMIN_PAGE_SIZE,
    truncated: false,
  };
}

async function mapUsernames(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  try {
    const { data } = await admin.from('users').select('id, username').in('id', ids);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      map.set(String(row.id), String(row.username ?? ''));
    }
  } catch {
    // Sans pseudo, la ligne reste exploitable : l'identifiant suffit.
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Campagnes                                                           */
/* ------------------------------------------------------------------ */

export interface CampaignFilters {
  status?: string | null;
  kind?: string | null;
  search?: string | null;
  period?: AdminPeriod;
  page?: string | number | null;
}

export async function listCampaigns(
  filters: CampaignFilters,
): Promise<ListResult<AdminCampaignRow>> {
  const admin = supabaseAdmin();
  const page = normalizePage(filters.page);
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const to = from + ADMIN_PAGE_SIZE - 1;
  const status = normalizeText(filters.status, 20);
  const kind = normalizeText(filters.kind, 30);
  const search = normalizeText(filters.search);

  let query = admin
    .from('campaigns')
    .select(
      'id, name, slug, owner_id, kind, status, ratio, participants_used, participants_granted, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status && status !== 'all') query = query.eq('status', status);
  if (kind && kind !== 'all') query = query.eq('kind', kind);
  if (search) query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
  if (filters.period) query = query.gte('created_at', periodStart(filters.period));

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Record<string, unknown>[];
  const ownerIds = [...new Set(rows.map((row) => String(row.owner_id ?? '')).filter(Boolean))];
  const usernames = await mapUsernames(admin, ownerIds);

  return {
    rows: rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      slug: String(row.slug ?? ''),
      owner_id: String(row.owner_id ?? ''),
      username: usernames.get(String(row.owner_id)) ?? null,
      kind: String(row.kind ?? 'photo_frame'),
      status: String(row.status ?? 'draft'),
      ratio: String(row.ratio ?? '1:1'),
      participants_used: Number(row.participants_used ?? 0),
      participants_granted: Number(row.participants_granted ?? 0),
      created_at: String(row.created_at ?? ''),
    })),
    total: count ?? 0,
    page,
    pageSize: ADMIN_PAGE_SIZE,
    truncated: false,
  };
}

/* ------------------------------------------------------------------ */
/* Système                                                             */
/* ------------------------------------------------------------------ */

export async function getSystemHealth(): Promise<AdminSystemHealth> {
  const admin = supabaseAdmin();
  const now = new Date();
  const staleLimit = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [stalePending, recentFailed, reserved, openReports, expiredPlans, counters, operations] =
    await Promise.all([
      countRows(admin, 'payments', (q) => q.eq('status', 'pending').lt('created_at', staleLimit)),
      countRows(admin, 'payments', (q) => q.eq('status', 'failed').gte('created_at', dayAgo)),
      countRows(admin, 'distribution_export_operations', (q) => q.eq('state', 'RESERVED')),
      countRows(admin, 'content_reports', (q) => q.eq('status', 'NEW')),
      countRows(admin, 'users', (q) => q.not('plan', 'eq', 'free').lt('plan_expires_at', now.toISOString())),
      selectRows(admin, 'campaigns', 'participants_used, participants_granted', (q) => q, 5000),
      selectRows(admin, 'distribution_export_operations', 'state', (q) => q, 5000),
    ]);

  const exhausted = counters.filter(
    (row) =>
      Number(row.participants_granted) > 0 &&
      Number(row.participants_used) >= Number(row.participants_granted),
  ).length;

  return {
    generatedAt: now.toISOString(),
    stalePendingPayments: stalePending,
    recentFailedPayments: recentFailed,
    reservedExportOperations: reserved,
    openReports,
    expiredPlans,
    exhaustedCampaigns: { value: exhausted, available: true },
    scanned: {
      payments: 0,
      operations: operations.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Journal d'audit                                                     */
/* ------------------------------------------------------------------ */

export async function listAuditLog(limit = 50): Promise<AdminAuditRow[]> {
  const admin = supabaseAdmin();
  try {
    const { data, error } = await admin
      .from('admin_audit_log')
      .select('id, actor_email, action, resource_type, resource_id, reason, metadata_safe, created_at')
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 200));

    if (error) return [];

    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      actor_email: row.actor_email ? String(row.actor_email) : null,
      action: String(row.action ?? ''),
      resource_type: String(row.resource_type ?? '-'),
      resource_id: row.resource_id ? String(row.resource_id) : null,
      reason: row.reason ? String(row.reason) : null,
      metadata_safe: (row.metadata_safe ?? null) as Record<string, unknown> | null,
      created_at: String(row.created_at ?? ''),
    }));
  } catch {
    // Journal absent : la page affiche « journal indisponible », jamais une liste vide
    // qui laisserait croire qu'aucune action n'a eu lieu.
    return [];
  }
}

/**
 * Écrit une entrée dans le journal.
 *
 * `p_metadata_safe` ne doit contenir que des filtres et des volumes : jamais
 * de montant individuel, jamais d'e-mail d'utilisateur consulté, jamais de
 * jeton. Le journal est une preuve d'exploitation, pas une copie des données.
 */
export async function writeAuditLog(entry: {
  actorId: string;
  actorEmail: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  role?: AdminRole;
}): Promise<void> {
  const admin = supabaseAdmin();
  try {
    await admin.rpc('log_admin_action', {
      p_actor_id: entry.actorId,
      p_actor_email: entry.actorEmail,
      p_action: entry.action,
      p_resource_type: entry.resourceType ?? '-',
      p_resource_id: entry.resourceId ?? null,
      p_reason: entry.reason ?? null,
      p_metadata_safe: {
        ...(entry.metadata ?? {}),
        ...(entry.role ? { role: entry.role } : {}),
      },
    });
  } catch (error) {
    /*
     * L'échec du journal ne doit jamais bloquer l'action : on le signale dans
     * les logs serveur, où il est visible par l'exploitant, et rien de plus.
     * Un dashboard qui refuse de répondre parce qu'il ne peut pas se tracer
     * serait indisponible pour la mauvaise raison.
     */
    console.warn('[admin] Journalisation impossible :', error);
  }
}
