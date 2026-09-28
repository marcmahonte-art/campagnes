'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Coins, Frame, Info, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { FeatureGate } from '@/components/plans/feature-gate';
import { Spinner } from '@/components/ui/feedback';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { consumedRatio } from '@/lib/credits';
import { hasFeature } from '@/lib/plans';
import { ratioSpec } from '@/lib/ratios';
import type { CampaignWithFrame } from '@/lib/types';

const numberFormat = new Intl.NumberFormat('fr-FR');

export default function AnalyticsPage() {
  const { user } = useSession();
  const [campaigns, setCampaigns] = useState<CampaignWithFrame[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setCampaigns(await backend.listCampaigns(user.id));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const published = campaigns.filter((c) => c.status === 'published');
    const consumed = campaigns.reduce((sum, c) => sum + c.credits_consumed, 0);
    const budget = campaigns.reduce((sum, c) => sum + c.distribution_budget, 0);
    const activeBudget = published.reduce(
      (sum, c) => sum + Math.max(0, c.distribution_budget - c.credits_consumed),
      0,
    );

    const byRatio = new Map<string, number>();
    for (const campaign of campaigns) {
      byRatio.set(campaign.ratio, (byRatio.get(campaign.ratio) ?? 0) + 1);
    }

    return { published, consumed, budget, activeBudget, byRatio };
  }, [campaigns]);

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-5 text-gray-400" />
      </div>
    );
  }

  if (!hasFeature(user.plan, 'analytics')) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-6">
        <header>
          <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">Analytics</h1>
          <p className="mt-2 text-sm text-gray-500">
            Suivez la consommation de vos campagnes et l’usage de vos formats.
          </p>
        </header>
        <FeatureGate
          feature="analytics"
          plan={user.plan}
          description="Statistiques de distribution par campagne : volume consommé, budget restant, répartition des formats."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-5 text-gray-400" />
      </div>
    );
  }

  const maxConsumed = Math.max(1, ...campaigns.map((c) => c.credits_consumed));

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">Analytics</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
          Consommation de distribution et usage des formats, campagne par campagne.
        </p>
      </header>

      {/* ---------------- Chiffres clés ---------------- */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Frame}
          label="Campagnes"
          value={numberFormat.format(campaigns.length)}
          hint={`${totals.published.length} publiée${totals.published.length > 1 ? 's' : ''}`}
        />
        <StatCard
          icon={Coins}
          label="Participations servies"
          value={numberFormat.format(totals.consumed)}
          hint="crédits décomptés"
        />
        <StatCard
          icon={TrendingUp}
          label="Budget restant"
          value={numberFormat.format(totals.activeBudget)}
          hint={`sur ${numberFormat.format(totals.budget)} alloués`}
        />
        <StatCard
          icon={BarChart3}
          label="Taux de consommation"
          value={`${consumedRatio(totals.consumed, totals.budget)} %`}
          hint="des budgets alloués"
        />
      </div>

      {/* ---------------- Répartition des formats ---------------- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[18px] font-semibold">Répartition des formats</h2>
        <Card className="flex flex-col gap-4 p-5">
          {totals.byRatio.size === 0 ? (
            <p className="text-[13px] text-gray-500">Aucune campagne pour le moment.</p>
          ) : (
            [...totals.byRatio.entries()].map(([ratio, count]) => {
              const share = Math.round((count / campaigns.length) * 100);
              return (
                <div key={ratio} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-medium">
                      {ratioSpec(ratio as '1:1' | '16:9' | '9:16').label}
                      <span className="ml-2 font-normal text-gray-500">{ratio}</span>
                    </span>
                    <span className="text-gray-500">
                      {count} campagne{count > 1 ? 's' : ''} · {share} %
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-pill bg-gray-100">
                    <div
                      className="bg-brand-gradient h-full rounded-pill"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </Card>
      </section>

      {/* ---------------- Détail par campagne ---------------- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[18px] font-semibold">Détail par campagne</h2>
          <Link
            href="/dashboard"
            className="text-[13px] text-gray-500 underline underline-offset-4 transition-colors hover:text-ink"
          >
            Gérer mes campagnes
          </Link>
        </div>

        {campaigns.length === 0 ? (
          <Card className="p-10 text-center text-sm text-gray-500">
            Créez une campagne pour commencer à mesurer.
          </Card>
        ) : (
          <Card className="divide-y divide-gray-100 overflow-hidden">
            {campaigns.map((campaign) => {
              const ratio = consumedRatio(campaign.credits_consumed, campaign.distribution_budget);
              return (
                <div key={campaign.id} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="text-[14px] font-medium transition-colors hover:text-purple"
                    >
                      {campaign.name}
                    </Link>
                    <span className="text-[12px] text-gray-500">
                      {campaign.status === 'published' ? 'Publiée' : 'Brouillon'} ·{' '}
                      {ratioSpec(campaign.ratio).label}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-gray-100">
                      <div
                        className="bg-brand-gradient h-full rounded-pill transition-[width] duration-300 ease-brand"
                        style={{
                          width: `${campaign.distribution_budget > 0 ? Math.max(2, ratio) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-40 shrink-0 text-right text-[12px] text-gray-500">
                      {numberFormat.format(campaign.credits_consumed)} /{' '}
                      {campaign.distribution_budget > 0
                        ? numberFormat.format(campaign.distribution_budget)
                        : 'non défini'}
                    </span>
                  </div>

                  {/* Repère visuel : longueur relative au plus gros consommateur. */}
                  <div className="h-1 w-full overflow-hidden rounded-pill bg-gray-50">
                    <div
                      className="h-full rounded-pill bg-gray-200"
                      style={{ width: `${(campaign.credits_consumed / maxConsumed) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <p className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] leading-relaxed text-gray-500">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Les statistiques de trafic (ouvertures de lien, taux de conversion) arriveront avec le
          parcours participant. Cette page mesure dès aujourd’hui ce qui est déjà réel : la
          consommation de vos budgets de distribution.
        </span>
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Frame;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className="flex items-center gap-2 text-[13px] font-medium text-gray-500">
        <Icon className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
        {label}
      </span>
      <span className="text-[28px] font-bold leading-none">{value}</span>
      <span className="text-[12px] text-gray-500">{hint}</span>
    </Card>
  );
}
