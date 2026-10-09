'use client';

import { AdminHeader } from '@/components/admin/admin-shell';
import {
  AdminCard,
  AdminKpi,
  AdminSectionTitle,
  EmptyState,
  ErrorState,
  SkeletonBlock,
  formatCounter,
} from '@/components/admin/admin-kpi';
import { AdminTable } from '@/components/admin/admin-table';
import { RefreshButton } from '@/components/admin/period-filter';
import { formatDateTime, useAdminData } from '@/components/admin/use-admin-data';
import type { AdminAuditRow, AdminSystemHealth } from '@/lib/admin/types';

interface SystemResponse {
  ok: true;
  health: AdminSystemHealth;
  audit: AdminAuditRow[];
  auditVisible: boolean;
  definitions: Record<string, string>;
}

/**
 * Système et journal.
 *
 * Les compteurs de cette page sont des **signaux d'exploitation**, pas des
 * indicateurs commerciaux : un paiement en attente n'est pas un revenu, c'est
 * une réconciliation à faire. Aucune clé, aucun jeton, aucun payload de
 * webhook n'est affiché — ils ne sont pas même lus.
 */
export function SystemView() {
  const { data, loading, error, refresh } = useAdminData<SystemResponse>('/api/admin/system');

  const health = data?.health ?? null;

  return (
    <div>
      <AdminHeader
        title="Système"
        description="Signaux d’exploitation : ce qui bloque, ce qui traîne, ce qui doit être réconcilié."
      >
        <RefreshButton onClick={refresh} busy={loading} />
      </AdminHeader>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!health && loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-24" />
          ))}
        </div>
      ) : null}

      {health ? (
        <div className="space-y-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AdminKpi
              label="Paiements en attente"
              value={formatCounter(health.stalePendingPayments)}
              hint="plus de 30 minutes"
              definition={data?.definitions.stalePendingPayments}
            />
            <AdminKpi
              label="Échecs 24 h"
              value={formatCounter(health.recentFailedPayments)}
              definition={data?.definitions.recentFailedPayments}
            />
            <AdminKpi
              label="Exports réservés"
              value={formatCounter(health.reservedExportOperations)}
              definition={data?.definitions.reservedExportOperations}
            />
            <AdminKpi
              label="Signalements ouverts"
              value={formatCounter(health.openReports)}
              definition="Signalements au statut NEW, jamais traités."
            />
            <AdminKpi
              label="Formules échues"
              value={formatCounter(health.expiredPlans)}
              definition="Comptes payants dont l’échéance est passée."
            />
            <AdminKpi
              label="Quotas épuisés"
              value={formatCounter(health.exhaustedCampaigns)}
              definition={data?.definitions.exhaustedCampaigns}
            />
          </div>

          <section>
            <AdminSectionTitle>Journal d’audit</AdminSectionTitle>
            {!data?.auditVisible ? (
              <AdminCard>
                <p className="text-[13px] leading-relaxed text-gray-500">
                  Le journal des actions administratives est réservé au super administrateur.
                </p>
              </AdminCard>
            ) : data && data.audit.length === 0 ? (
              <EmptyState
                title="Journal indisponible"
                hint="Soit aucune action n’a été journalisée, soit la migration d’audit n’est pas appliquée."
              />
            ) : (
              <AdminTable
                rows={data?.audit ?? []}
                rowKey={(row) => row.id}
                emptyLabel="Aucune entrée."
                columns={[
                  { key: 'action', header: 'Action', render: (row) => row.action },
                  {
                    key: 'actor',
                    header: 'Administrateur',
                    render: (row) => row.actor_email ?? '—',
                  },
                  {
                    key: 'resource',
                    header: 'Ressource',
                    render: (row) => row.resource_type,
                  },
                  { key: 'reason', header: 'Motif', render: (row) => row.reason ?? '—' },
                  {
                    key: 'created',
                    header: 'Date',
                    render: (row) => formatDateTime(row.created_at),
                  },
                ]}
              />
            )}
          </section>

          <p className="text-[12px] text-gray-400">
            État lu le {new Date(health.generatedAt).toLocaleString('fr-FR')}
          </p>
        </div>
      ) : null}
    </div>
  );
}
