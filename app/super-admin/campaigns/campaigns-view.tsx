'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { AdminHeader } from '@/components/admin/admin-shell';
import { EmptyState, ErrorState, SkeletonBlock, StatusBadge } from '@/components/admin/admin-kpi';
import { AdminPager, AdminTable } from '@/components/admin/admin-table';
import { PeriodFilter, RefreshButton, SearchFilter, SelectFilter } from '@/components/admin/period-filter';
import { formatDate, useAdminData } from '@/components/admin/use-admin-data';
import { normalizePeriod } from '@/lib/admin/repository';
import type { AdminCampaignRow, ListResult } from '@/lib/admin/types';

interface CampaignsResponse extends ListResult<AdminCampaignRow> {
  ok: true;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'published', label: 'Publiée' },
];

const KIND_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'photo_frame', label: 'Photo Frame' },
  { value: 'background_frame', label: 'Background Frame' },
  { value: 'video_frame', label: 'Video Frame' },
];

/**
 * Campagnes.
 *
 * Le jeton privé de distribution (`/d/[token]`) n'apparaît **jamais** ici : il
 * ouvre un accès payant. Seul le `slug`, identifiant public, est affiché —
 * c'est celui qu'on voit dans une URL signalée.
 */
export function CampaignsView() {
  const params = useSearchParams();
  const router = useRouter();
  const period = normalizePeriod(params.get('period'));

  const query = new URLSearchParams({ period, page: params.get('page') ?? '1' });
  if (params.get('search')) query.set('search', String(params.get('search')));
  if (params.get('status')) query.set('status', String(params.get('status')));
  if (params.get('kind')) query.set('kind', String(params.get('kind')));

  const { data, loading, error, refresh } = useAdminData<CampaignsResponse>(
    `/api/admin/campaigns?${query.toString()}`,
  );

  const exportHref = () => {
    const reason = window.prompt('Motif de l’export (journalisé) :');
    if (!reason || !reason.trim()) return;
    const exportParams = new URLSearchParams(query.toString());
    exportParams.set('resource', 'campaigns');
    exportParams.set('reason', reason.trim());
    window.location.href = `/api/admin/export?${exportParams.toString()}`;
  };

  const goToPage = (page: number) => {
    const next = new URLSearchParams(params.toString());
    next.set('page', String(page));
    router.replace(`/super-admin/campaigns?${next.toString()}`);
  };

  return (
    <div>
      <AdminHeader
        title="Campagnes"
        description="Campagnes créées, leur statut et la consommation de leur quota. Aucun jeton privé de distribution n’est exposé."
      >
        <PeriodFilter />
        <RefreshButton onClick={refresh} busy={loading} />
      </AdminHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchFilter placeholder="Nom ou slug" />
        <SelectFilter name="status" label="Statut" options={STATUS_OPTIONS} />
        <SelectFilter name="kind" label="Type" options={KIND_OPTIONS} />
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
        <EmptyState title="Aucune campagne" hint="Aucune campagne ne correspond aux filtres." />
      ) : null}

      {data && data.rows.length > 0 ? (
        <>
          <AdminTable
            rows={data.rows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'name',
                header: 'Campagne',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="text-[12px] text-gray-500">
                      /c/{row.slug}
                      {row.username ? ` · @${row.username}` : ''}
                    </p>
                  </div>
                ),
              },
              {
                key: 'kind',
                header: 'Type',
                render: (row) => row.kind,
              },
              {
                key: 'status',
                header: 'Statut',
                render: (row) => <StatusBadge status={row.status} />,
              },
              {
                key: 'quota',
                header: 'Quota',
                render: (row) => `${row.participants_used} / ${row.participants_granted}`,
              },
              {
                key: 'ratio',
                header: 'Format',
                render: (row) => row.ratio,
              },
              {
                key: 'created',
                header: 'Créée le',
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
    </div>
  );
}
