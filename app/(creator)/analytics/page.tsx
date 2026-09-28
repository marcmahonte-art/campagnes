'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Eye, Frame, Info, LayoutGrid } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { FeatureGate } from '@/components/plans/feature-gate';
import { Spinner } from '@/components/ui/feedback';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
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
    const drafts = campaigns.filter((c) => c.status === 'draft');

    const byRatio = new Map<string, number>();
    for (const campaign of campaigns) {
      byRatio.set(campaign.ratio, (byRatio.get(campaign.ratio) ?? 0) + 1);
    }

    return { published, drafts, byRatio };
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
            Suivez l’activité de vos campagnes et l’usage de vos formats.
          </p>
        </header>
        <FeatureGate
          feature="analytics"
          plan={user.plan}
          description="Statistiques par campagne : état de publication, répartition des formats, historique de création."
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

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">Analytics</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
          Activité de vos campagnes et usage de vos formats.
        </p>
      </header>

      {/* ---------------- Chiffres clés ---------------- */}
      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard
          icon={LayoutGrid}
          label="Campagnes"
          value={numberFormat.format(campaigns.length)}
          hint="au total"
        />
        <StatCard
          icon={Eye}
          label="Publiées"
          value={numberFormat.format(totals.published.length)}
          hint="liens actifs"
        />
        <StatCard
          icon={Frame}
          label="Brouillons"
          value={numberFormat.format(totals.drafts.length)}
          hint="en cours de préparation"
        />
      </div>

      {/* ---------------- Répartition des formats ---------------- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[18px] font-semibold">Répartition des formats</h2>
        <Card className="flex flex-col gap-4 p-5">
          {totals.byRatio.size === 0 ? (
            <p className="text-[13px] text-gray-500">Aucune campagne pour le moment.</p>
          ) : (
            [...totals.byRatio.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([ratio, count]) => {
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
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="truncate text-[14px] font-medium transition-colors hover:text-purple"
                  >
                    {campaign.name}
                  </Link>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    {ratioSpec(campaign.ratio).label} · créée le{' '}
                    {new Date(campaign.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>

                <span
                  className={
                    campaign.status === 'published'
                      ? 'rounded-pill border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success'
                      : 'rounded-pill border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700'
                  }
                >
                  {campaign.status === 'published' ? 'Publiée' : 'Brouillon'}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <p className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] leading-relaxed text-gray-500">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Les statistiques de trafic (ouvertures de lien, taux de conversion) arriveront avec le
          parcours participant. Cette page mesure ce qui est disponible aujourd’hui : l’activité de
          vos campagnes.
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
