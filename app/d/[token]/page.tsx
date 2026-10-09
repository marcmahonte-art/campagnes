'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ParticipantJourney } from '@/components/participant/participant-journey';
import { ToastProvider } from '@/components/ui/toast';
import { distributionService } from '@/lib/distribution-service';
import type { PrivateCampaignAccess, DistributionExportRequest } from '@/lib/backend/types';
import { technicalHash } from '@/lib/distribution-export';

/** Le changement de jeton détruit l'ancien parcours et son droit d'export. */
export default function PrivateParticipantPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [state, setState] = useState<{ token: string; access?: PrivateCampaignAccess; error?: string }>({ token: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ token });
    if (!token) { setState({ token, access: { kind: 'unavailable' } }); return; }
    void (async () => {
      const key = `campagnes.export.v1.${await technicalHash(token)}`;
      const saved = sessionStorage.getItem(key);
      const resume = saved ? JSON.parse(saved) as DistributionExportRequest : null;
      return distributionService.getPrivateAccess(token, resume);
    })().then((result) => {
      if (alive) setState({ token, access: result.data, error: result.error });
    }).catch(() => {
      if (alive) setState({ token, error: 'Impossible de vérifier ce lien. Votre connexion est peut-être interrompue.' });
    });
    return () => { alive = false; };
  }, [token, retry]);
  const current = state.token === token ? state : { token };
  const campaign = current.access?.kind === 'distributed' ? current.access.campaign : null;
  if (current.error) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="font-semibold">Vérification momentanément impossible</h1>
      <p role="alert" className="text-sm text-gray-600">{current.error}</p>
      <button className="rounded-full border border-gray-300 px-5 py-2 text-sm" onClick={() => setRetry((value) => value + 1)}>Réessayer</button>
    </main>
  );
  return (
    <ToastProvider>
      <ParticipantJourney key={token} campaign={campaign} loading={!current.access} sharing={false}
        distributionToken={token} privateAccessReady={current.access?.kind === 'distributed'} clientLogoUrl={campaign?.clientLogoUrl ?? null} />
    </ToastProvider>
  );
}
