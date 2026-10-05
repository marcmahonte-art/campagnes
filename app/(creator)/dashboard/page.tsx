'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import { CampaignCard } from '@/components/dashboard/campaign-card';
import { CampaignTypeSelectorModal } from '@/components/campaign/type-selector-modal';
import { PlanBadge } from '@/components/plans/plan-badge';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { PRICING_PLANS } from '@/lib/pricing/config';
import type { CampaignKind, CampaignWithFrame } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useSession();
  const [campaigns, setCampaigns] = useState<CampaignWithFrame[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void backend.listCampaigns(user.id).then((list) => {
      if (alive) setCampaigns(list);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const published = campaigns?.filter((c) => c.status === 'published').length ?? 0;
  const drafts = campaigns?.filter((c) => c.status === 'draft').length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">Mes campagnes</h1>
          <p className="mt-2 text-sm text-gray-500">
            {campaigns === null
              ? 'Chargement…'
              : campaigns.length === 0
                ? 'Aucune campagne pour le moment.'
                : `${published} publiée${published > 1 ? 's' : ''} · ${drafts} brouillon${drafts > 1 ? 's' : ''}`}
          </p>
        </div>

        <Button
          variant="primary"
          size="lg"
          className="shrink-0"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="size-4" strokeWidth={2} aria-hidden />
          Nouvelle campagne
        </Button>
      </header>

      {user && campaigns !== null && <MonetisationBanner plan={user.plan} campaigns={campaigns} />}

      {campaigns === null ? (
        <div className="flex h-56 items-center justify-center">
          <Spinner className="size-5 text-gray-400" />
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState onNew={() => setPickerOpen(true)} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}

      {/*
        Le type choisi part dans l'URL : le formulaire suivant le lit et ne
        repose pas la question. On ne crée rien ici — une campagne sans nom n'a
        ni adresse publique ni intérêt, et remplirait le tableau de bord.
      */}
      <CampaignTypeSelectorModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={(kind: CampaignKind) => {
          setPickerOpen(false);
          router.push(`/campaigns/new?kind=${kind}`);
        }}
      />
    </div>
  );
}

function MonetisationBanner({
  plan,
  campaigns,
}: {
  plan: 'free' | 'creator' | 'organization';
  campaigns: CampaignWithFrame[];
}) {
  const planConfig = PRICING_PLANS[plan];
  const used = campaigns.reduce((sum, campaign) => sum + campaign.participants_used, 0);
  const granted = campaigns.reduce((sum, campaign) => sum + campaign.participants_granted, 0);

  return (
    <Card className="grid gap-4 p-4 md:grid-cols-[1.2fr_1fr_1fr] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">Formule active</span>
          <PlanBadge plan={plan} />
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-500">
          {planConfig.quotaLabel}. Prépaiement sans reconduction automatique.
        </p>
      </div>

      <div className="rounded-md bg-gray-50 px-3 py-2.5">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Campagnes
        </span>
        <span className="mt-1 block text-[14px] font-semibold text-ink">
          {new Intl.NumberFormat('fr-FR').format(used)} /{' '}
          {new Intl.NumberFormat('fr-FR').format(granted)} téléchargements utilisés
        </span>
      </div>

      <div className="rounded-md bg-gray-50 px-3 py-2.5">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Crédits achetés
        </span>
        <span className="mt-1 block text-[13px] font-medium text-gray-600">
          Suivis sur chaque campagne
        </span>
      </div>
    </Card>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-md bg-gray-50">
        <LayoutGrid className="size-6 text-gray-400" strokeWidth={1.75} aria-hidden />
      </span>
      <div>
        <h2 className="text-[20px] font-semibold">Créez votre première campagne</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
          Un nom, un format, un cadre. Vous obtenez un lien à partager à votre communauté.
        </p>
      </div>
      <Button variant="primary" size="lg" onClick={onNew}>
        <Plus className="size-4" strokeWidth={2} aria-hidden />
        Nouvelle campagne
      </Button>
      <p className="text-xs text-gray-400">
        Votre page publique :{' '}
        <Link href="/dashboard" className="underline underline-offset-4">
          campagnes.app/@vous
        </Link>
      </p>
    </Card>
  );
}
