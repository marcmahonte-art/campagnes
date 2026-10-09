/**
 * Contrats partagés entre les routes d'administration et leur interface.
 *
 * Ces types vivent à part pour une raison précise : les composants clients ne
 * doivent pas importer `lib/admin/repository.ts`, qui charge le client
 * `service_role`. Un type peut traverser la frontière serveur/client, un
 * module d'accès aux données ne le doit jamais.
 */

export interface Counter {
  value: number;
  available: boolean;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface Breakdown {
  plan?: string;
  status?: string;
  count: number;
}

export interface AdminMetrics {
  generatedAt: string;
  period: string;
  since: string;
  users: {
    total: Counter;
    newInPeriod: Counter;
    byPlan: { plan: string; count: number }[];
    withoutCampaign: Counter;
    expiredPlans: Counter;
    expiringSoon: Counter;
  };
  campaigns: {
    total: Counter;
    newInPeriod: Counter;
    published: Counter;
    draft: Counter;
    quotaUsed: Counter;
    quotaGranted: Counter;
    exhausted: Counter;
  };
  payments: {
    completed: Counter;
    pending: Counter;
    failed: Counter;
    cancelled: Counter;
    revenueFcfa: Counter;
    byStatus: { status: string; count: number }[];
  };
  passes: {
    total: Counter;
    active: Counter;
    revenueFcfa: Counter;
  };
  distribution: {
    links: Counter;
    confirmedExports: Counter;
    reservedExports: Counter;
    quotaGranted: Counter;
  };
  reports: {
    open: Counter;
    total: Counter;
  };
}

export interface AdminSeries {
  revenue: SeriesPoint[];
  signups: SeriesPoint[];
  campaigns: SeriesPoint[];
  paymentsConfirmed: SeriesPoint[];
}

export interface AdminSystemHealth {
  generatedAt: string;
  stalePendingPayments: Counter;
  recentFailedPayments: Counter;
  reservedExportOperations: Counter;
  openReports: Counter;
  expiredPlans: Counter;
  exhaustedCampaigns: Counter;
  scanned: {
    payments: number;
    operations: number;
  };
}

export interface ListResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  truncated: boolean;
}

export interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  org_name: string | null;
  plan: string;
  onboarded_at: string | null;
  created_at: string;
  plan_expires_at: string | null;
  campaign_count: number;
  paid_total_fcfa: number;
}

export interface AdminPaymentRow {
  id: string;
  deposit_id: string;
  user_id: string | null;
  username: string | null;
  plan: string | null;
  purchase_type: string | null;
  amount: number;
  currency: string;
  status: string;
  provider: string | null;
  country: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminCampaignRow {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  username: string | null;
  kind: string;
  status: string;
  ratio: string;
  participants_used: number;
  participants_granted: number;
  created_at: string;
}

export interface AdminAuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  reason: string | null;
  metadata_safe: Record<string, unknown> | null;
  created_at: string;
}
