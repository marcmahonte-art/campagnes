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
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
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
