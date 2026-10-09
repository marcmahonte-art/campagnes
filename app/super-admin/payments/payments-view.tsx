'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { AdminHeader } from '@/components/admin/admin-shell';
import { EmptyState, ErrorState, SkeletonBlock, StatusBadge } from '@/components/admin/admin-kpi';
import { AdminPager, AdminTable } from '@/components/admin/admin-table';
import { PeriodFilter, RefreshButton, SearchFilter, SelectFilter } from '@/components/admin/period-filter';
import { formatAmount, formatDateTime, useAdminData } from '@/components/admin/use-admin-data';
import { normalizePeriod } from '@/lib/admin/repository';
import type { AdminPaymentRow, ListResult } from '@/lib/admin/types';

interface PaymentsResponse extends ListResult<AdminPaymentRow> {
  ok: true;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'pending', label: 'En attente' },
  { value: 'completed', label: 'Confirmé' },
  { value: 'failed', label: 'Échoué' },
  { value: 'cancelled', label: 'Annulé' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'plan', label: 'Abonnement' },
  { value: 'campaign_topup', label: 'Recharge de campagne' },
  { value: 'account_credits', label: 'Crédits de compte' },
];

/**
 * Paiements — **lecture seule**.
 *
 * Aucun bouton « marquer comme réussi » : un paiement n'est confirmé que
 * parce que le serveur l'a vérifié auprès de la passerelle. Un écran qui
 * permettrait de forcer le statut rendrait le chiffre d'affaires faux, et
 * créditerait une formule sans encaissement.
 */
export function PaymentsView() {
  const params = useSearchParams();
  const router = useRouter();
  const period = normalizePeriod(params.get('period'));

  const query = new URLSearchParams({ period, page: params.get('page') ?? '1' });
  if (params.get('search')) query.set('search', String(params.get('search')));
  if (params.get('status')) query.set('status', String(params.get('status')));
  if (params.get('type')) query.set('type', String(params.get('type')));

  const { data, loading, error, refresh } = useAdminData<PaymentsResponse>(
    `/api/admin/payments?${query.toString()}`,
  );

  const exportHref = () => {
    const reason = window.prompt('Motif de l’export (journalisé) :');
    if (!reason || !reason.trim()) return;
    const exportParams = new URLSearchParams(query.toString());
    exportParams.set('resource', 'payments');
    exportParams.set('reason', reason.trim());
    window.location.href = `/api/admin/export?${exportParams.toString()}`;
  };

  const goToPage = (page: number) => {
    const next = new URLSearchParams(params.toString());
    next.set('page', String(page));
    router.replace(`/super-admin/payments?${next.toString()}`);
  };

  return (
    <div>
      <AdminHeader
        title="Paiements"
        description="Transactions Mobile Money telles que la base les connaît. Le statut affiché est celui du serveur, jamais une déclaration du navigateur."
      >
        <PeriodFilter />
        <RefreshButton onClick={refresh} busy={loading} />
      </AdminHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchFilter placeholder="Référence ou opérateur" />
        <SelectFilter name="status" label="Statut" options={STATUS_OPTIONS} />
        <SelectFilter name="type" label="Produit" options={TYPE_OPTIONS} />
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
        <EmptyState title="Aucun paiement" hint="Aucune transaction ne correspond aux filtres." />
      ) : null}

      {data && data.rows.length > 0 ? (
        <>
          <AdminTable
            rows={data.rows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'deposit',
                header: 'Référence',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="font-mono text-[12px]">{row.deposit_id.slice(0, 13)}…</p>
                    <p className="text-[12px] text-gray-500">
                      {row.username ? `@${row.username}` : 'Compte inconnu'}
                    </p>
                  </div>
                ),
              },
              {
                key: 'product',
                header: 'Produit',
                render: (row) => row.purchase_type ?? row.plan ?? '—',
              },
              {
                key: 'amount',
                header: 'Montant',
                render: (row) => formatAmount(row.amount, row.currency),
              },
              {
                key: 'status',
                header: 'Statut',
                render: (row) => <StatusBadge status={row.status} />,
              },
              {
                key: 'country',
                header: 'Pays',
                render: (row) => row.country ?? '—',
              },
              {
                key: 'failure',
                header: 'Échec',
                render: (row) => row.failure_code ?? '—',
              },
              {
                key: 'created',
                header: 'Créé le',
                render: (row) => formatDateTime(row.created_at),
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
