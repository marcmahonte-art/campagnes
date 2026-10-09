'use client';

import { useSearchParams } from 'next/navigation';
import { AdminHeader } from '@/components/admin/admin-shell';
import {
  AdminCard,
  AdminKpi,
  AdminSectionTitle,
  ErrorState,
  SkeletonBlock,
  SparkChart,
  formatCounter,
  formatFcfaCounter,
} from '@/components/admin/admin-kpi';
import { PeriodFilter, RefreshButton } from '@/components/admin/period-filter';
import { useAdminData } from '@/components/admin/use-admin-data';
import { normalizePeriod } from '@/lib/admin/repository';
import type { AdminMetrics, AdminSeries } from '@/lib/admin/types';

interface OverviewResponse {
  ok: true;
  period: string;
  metrics: AdminMetrics;
  series: AdminSeries | null;
}

/**
 * Vue d'ensemble.
 *
 * Chaque carte porte sa définition : un chiffre sans formule est une opinion.
 * Les séries ne sont calculées que sur demande (`series=1`) — les courbes
 * coûtent une seconde lecture de la base, la page doit rester lisible même
 * quand elles échouent.
 */
export function OverviewView() {
  const params = useSearchParams();
  const period = normalizePeriod(params.get('period'));

  const { data, loading, error, refresh } = useAdminData<OverviewResponse>(
    `/api/admin/overview?period=${period}&series=1`,
  );

  const metrics = data?.metrics ?? null;

  return (
    <div>
      <AdminHeader
        title="Vue d’ensemble"
        description="L’état du business en trente secondes : comptes, campagnes, paiements confirmés et signaux d’exploitation."
      >
        <PeriodFilter />
        <RefreshButton onClick={refresh} busy={loading} />
      </AdminHeader>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!metrics && loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-28" />
          ))}
        </div>
      ) : null}

      {metrics ? (
        <div className="space-y-8">
          <section>
            <AdminSectionTitle>Utilisateurs</AdminSectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminKpi
                label="Comptes"
                value={formatCounter(metrics.users.total)}
                definition="Lignes de public.users, quel que soit le plan."
              />
              <AdminKpi
                label="Nouveaux comptes"
                value={formatCounter(metrics.users.newInPeriod)}
                hint="sur la période"
                definition="Comptes créés depuis le début de la période sélectionnée."
              />
              <AdminKpi
                label="Non onboardés"
                value={formatCounter(metrics.users.withoutCampaign)}
                hint="jamais passés par l’étape de profil"
                definition="Comptes sans onboarded_at : ils n’ont pas pu publier."
              />
              <AdminKpi
                label="Formules échues"
                value={formatCounter(metrics.users.expiredPlans)}
                hint={`${formatCounter(metrics.users.expiringSoon)} expirent sous 7 jours`}
                definition="Comptes payants dont plan_expires_at est passée ou approche."
              />
            </div>
          </section>

          <section>
            <AdminSectionTitle>Campagnes</AdminSectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminKpi
                label="Campagnes"
                value={formatCounter(metrics.campaigns.total)}
                definition="Toutes campagnes confondues, brouillons inclus."
              />
              <AdminKpi
                label="Publiées"
                value={formatCounter(metrics.campaigns.published)}
                hint={`${formatCounter(metrics.campaigns.draft)} en brouillon`}
                definition="Campagnes dont le statut est published."
              />
              <AdminKpi
                label="Quota consommé"
                value={formatCounter(metrics.campaigns.quotaUsed)}
                hint={`sur ${formatCounter(metrics.campaigns.quotaGranted)} accordés`}
                definition="Somme de participants_used sur toutes les campagnes."
              />
              <AdminKpi
                label="Quotas épuisés"
                value={formatCounter(metrics.campaigns.exhausted)}
                definition="Campagnes où participants_used >= participants_granted."
              />
            </div>
          </section>

          <section>
            <AdminSectionTitle>Paiements</AdminSectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminKpi
                label="Revenu encaissé"
                value={formatFcfaCounter(metrics.payments.revenueFcfa)}
                hint="brut, aucun frais déduit"
                definition="Somme des paiements confirmés (status = completed) sur la période."
              />
              <AdminKpi
                label="Confirmés"
                value={formatCounter(metrics.payments.completed)}
                definition="Paiements dont le serveur a vérifié l’encaissement."
              />
              <AdminKpi
                label="En attente"
                value={formatCounter(metrics.payments.pending)}
                hint="jamais comptés comme revenu"
                definition="Paiements initiés sans confirmation : à réconcilier, pas à encaisser."
              />
              <AdminKpi
                label="Échecs"
                value={formatCounter(metrics.payments.failed)}
                hint={`${formatCounter(metrics.payments.cancelled)} annulés`}
                definition="Paiements en échec remontés par la passerelle."
              />
            </div>
          </section>

          <section>
            <AdminSectionTitle>Distribution et pass</AdminSectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminKpi
                label="Liens de distribution"
                value={formatCounter(metrics.distribution.links)}
                definition="Liens privés créés, tous statuts confondus."
              />
              <AdminKpi
                label="Exports confirmés"
                value={formatCounter(metrics.distribution.confirmedExports)}
                hint={`${formatCounter(metrics.distribution.reservedExports)} réservés`}
                definition="Opérations d’export de distribution à l’état CONFIRMED."
              />
              <AdminKpi
                label="Pass vendus"
                value={formatCounter(metrics.passes.total)}
                hint={`${formatCounter(metrics.passes.active)} actifs`}
                definition="Commandes de pass sans filigrane, tous statuts."
              />
              <AdminKpi
                label="Revenu des pass"
                value={formatFcfaCounter(metrics.passes.revenueFcfa)}
                definition="Somme des commandes de pass actives ou expirées."
              />
            </div>
          </section>

          {data?.series ? (
            <section>
              <AdminSectionTitle>Évolution</AdminSectionTitle>
              <div className="grid gap-3 lg:grid-cols-2">
                <SparkChart
                  points={data.series.revenue}
                  label="Revenu confirmé par jour"
                  valueSuffix=" FCFA"
                />
                <SparkChart points={data.series.signups} label="Inscriptions par jour" />
                <SparkChart points={data.series.campaigns} label="Campagnes créées par jour" />
                <SparkChart
                  points={data.series.paymentsConfirmed}
                  label="Paiements confirmés par jour"
                />
              </div>
            </section>
          ) : null}

          <section>
            <AdminSectionTitle>Répartition des plans</AdminSectionTitle>
            <AdminCard>
              {metrics.users.byPlan.length === 0 ? (
                <p className="text-[13px] text-gray-500">Aucune donnée de plan.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.users.byPlan.map((entry) => (
                    <li key={entry.plan} className="flex items-center justify-between text-[13px]">
                      <span className="font-medium">{entry.plan}</span>
                      <span className="text-gray-500">
                        {new Intl.NumberFormat('fr-FR').format(entry.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          </section>

          <p className="text-[12px] text-gray-400">
            Données lues le {new Date(metrics.generatedAt).toLocaleString('fr-FR')} · période
            depuis le {new Date(metrics.since).toLocaleDateString('fr-FR')}
          </p>
        </div>
      ) : null}
    </div>
  );
}
