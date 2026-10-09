'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { AdminHeader } from '@/components/admin/admin-shell';
import { EmptyState, ErrorState, SkeletonBlock, StatusBadge } from '@/components/admin/admin-kpi';
import { AdminPager, AdminTable } from '@/components/admin/admin-table';
import { PeriodFilter, RefreshButton, SearchFilter, SelectFilter } from '@/components/admin/period-filter';
import { formatDate, useAdminData } from '@/components/admin/use-admin-data';
import { ADMIN_PERIOD_LABELS, normalizePeriod } from '@/lib/admin/filters';
import type { AdminUserRow, ListResult } from '@/lib/admin/types';

interface UsersResponse extends ListResult<AdminUserRow> {
  ok: true;
}

const PLAN_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'free', label: 'Gratuit' },
  { value: 'creator', label: 'Créateur' },
  { value: 'organization', label: 'Organisations & ONG' },
];

/**
 * Comptes.
 *
 * L'export demande un motif : un fichier d'e-mails qui sort de la plateforme
 * est un acte lourd, il doit être traçable et justifié, pas discret.
 */
export function UsersView() {
  const params = useSearchParams();
  const router = useRouter();
  const period = normalizePeriod(params.get('period'));

  const query = new URLSearchParams({
    period,
    page: params.get('page') ?? '1',
  });
  if (params.get('search')) query.set('search', String(params.get('search')));
  if (params.get('plan')) query.set('plan', String(params.get('plan')));

  const { data, loading, error, refresh } = useAdminData<UsersResponse>(
    `/api/admin/users?${query.toString()}`,
  );

  const exportHref = () => {
    const reason = window.prompt('Motif de l’export (journalisé) :');
    if (!reason || !reason.trim()) return;
    const exportParams = new URLSearchParams(query.toString());
    exportParams.set('resource', 'users');
    exportParams.set('reason', reason.trim());
    window.location.href = `/api/admin/export?${exportParams.toString()}`;
  };

  const goToPage = (page: number) => {
    const next = new URLSearchParams(params.toString());
    next.set('page', String(page));
    router.replace(`/super-admin/users?${next.toString()}`);
  };

  return (
    <div>
      <AdminHeader
        title="Utilisateurs"
        description="Comptes, formules et volume d’usage. La pagination est serveur : aucune page ne charge toute la table."
      >
        <PeriodFilter />
        <RefreshButton onClick={refresh} busy={loading} />
      </AdminHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchFilter placeholder="Pseudo ou e-mail" />
        <SelectFilter name="plan" label="Formule" options={PLAN_OPTIONS} />
        <button
          type="button"
          onClick={exportHref}
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-gray-50"
        >
          <Download className="size-4" strokeWidth={1.75} aria-hidden />
          Exporter en CSV
        </button>
      </div>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {loading && !data ? <SkeletonBlock className="h-64 w-full" /> : null}

      {data && data.rows.length === 0 ? (
        <EmptyState title="Aucun compte" hint="Aucune ligne ne correspond aux filtres." />
      ) : null}

      {data && data.rows.length > 0 ? (
        <>
          <AdminTable
            rows={data.rows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'username',
                header: 'Compte',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="font-medium">@{row.username}</p>
                    <p className="truncate text-[12px] text-gray-500">{row.email}</p>
                  </div>
                ),
              },
              {
                key: 'plan',
                header: 'Formule',
                render: (row) => <StatusBadge status={row.plan} />,
              },
              {
                key: 'campaigns',
                header: 'Campagnes',
                render: (row) => row.campaign_count,
              },
              {
                key: 'paid',
                header: 'Total payé',
                render: (row) =>
                  `${new Intl.NumberFormat('fr-FR').format(row.paid_total_fcfa)} FCFA`,
              },
              {
                key: 'expires',
                header: 'Échéance',
                render: (row) => formatDate(row.plan_expires_at),
              },
              {
                key: 'created',
                header: 'Inscription',
                render: (row) => formatDate(row.created_at),
              },
            ]}
          />
          <AdminPager
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={goToPage}
          />
        </>
      ) : null}

      <p className="mt-6 text-[12px] text-gray-400">
        Période analysée : {ADMIN_PERIOD_LABELS[period]}
      </p>
    </div>
  );
}
