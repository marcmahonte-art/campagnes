'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Info, QrCode as QrIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FeatureGate } from '@/components/plans/feature-gate';
import { Spinner } from '@/components/ui/feedback';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { hasFeature } from '@/lib/plans';
import { SITE_URL } from '@/lib/backend/config';
import type { CampaignWithFrame } from '@/lib/types';

/**
 * QR codes de campagne.
 *
 * Le QR est produit dans le navigateur (`qrcode`), sans service externe : aucune
 * donnée de campagne ne sort de la machine. Le fond est blanc et opaque, pour que
 * le code reste lisible une fois imprimé sur un flyer ou collé sur un mur.
 */
export default function QrCodesPage() {
  const { user } = useSession();
  const [campaigns, setCampaigns] = useState<CampaignWithFrame[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const list = await backend.listCampaigns(user.id);
    setCampaigns(list.filter((c) => c.status === 'published'));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-5 text-gray-400" />
      </div>
    );
  }

  if (!hasFeature(user.plan, 'qr')) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-6">
        <header>
          <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">QR Codes</h1>
          <p className="mt-2 text-sm text-gray-500">
            Un QR code par campagne publiée, prêt à imprimer.
          </p>
        </header>
        <FeatureGate
          feature="qr"
          plan={user.plan}
          description="Générez le QR code de chaque campagne publiée et téléchargez-le en PNG haute définition pour vos affiches et flyers."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">QR Codes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
          Un QR code par campagne publiée. Vos affiches renvoient directement au formulaire de
          participation.
        </p>
      </header>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner className="size-5 text-gray-400" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <QrIcon className="size-6 text-gray-300" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-gray-500">
            Aucune campagne publiée. Publiez une campagne pour obtenir son QR code.
          </p>
          <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/dashboard')}>
            Aller à mes campagnes
          </Button>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <QrCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] leading-relaxed text-gray-500">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Le QR code est généré dans votre navigateur : le lien de votre campagne ne transite par
          aucun service tiers.
        </span>
      </p>
    </div>
  );
}

function QrCard({ campaign }: { campaign: CampaignWithFrame }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = `${SITE_URL}/c/${campaign.slug}`;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const QRCode = await import('qrcode');
        const png = await QRCode.toDataURL(url, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 1024,
          color: { dark: '#000000ff', light: '#ffffffff' },
        });
        if (alive) setDataUrl(png);
      } catch {
        if (alive) setError('Génération impossible.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  async function download() {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qr-${campaign.slug}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="truncate text-[15px] font-semibold">{campaign.name}</h2>
        <Link
          href={`/campaigns/${campaign.id}`}
          className="mt-0.5 block truncate text-[12px] text-gray-500 underline underline-offset-4 transition-colors hover:text-ink"
        >
          /c/{campaign.slug}
        </Link>
      </div>

      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white p-3">
        {error ? (
          <p className="text-[12px] text-error">{error}</p>
        ) : dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={`QR code de la campagne ${campaign.name}`} className="size-full" />
        ) : (
          <Spinner className="size-5 text-gray-300" />
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={() => void download()} disabled={!dataUrl}>
        <Download className="size-3.5" strokeWidth={1.75} aria-hidden />
        Télécharger en PNG
      </Button>
    </Card>
  );
}
