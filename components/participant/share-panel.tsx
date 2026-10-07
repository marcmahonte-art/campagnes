'use client';

import { useCallback, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { ShareMenu } from '@/components/participant/share-menu';
import { backend } from '@/lib/backend';
import { buildShareText, publicCampaignUrl, type ShareEventType } from '@/lib/share';
import type { GalleryItem } from '@/lib/types';

/**
 * Point d'entrée unique du partage public. Les destinations sont visibles
 * uniquement après activation du bouton « Partager ».
 */
export function SharePanel({ campaign }: { campaign: GalleryItem }) {
  const notify = useToast();
  /** Lien de secours si le navigateur refuse l'accès au presse-papiers. */
  const [manual, setManual] = useState<string | null>(null);

  const url = useMemo(() => publicCampaignUrl(campaign.slug), [campaign.slug]);
  const text = useMemo(() => buildShareText(campaign, url), [campaign, url]);

  /** Le suivi est facultatif : une panne ne doit pas ralentir le partage. */
  const track = useCallback(
    (event: ShareEventType) => {
      void backend.recordShareEvent(campaign.id, event).catch(() => {});
    },
    [campaign.id],
  );

  /** Copie l'URL publique et confirme la réussite, sinon propose la copie manuelle. */
  const copyLink = useCallback(async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(url);
      notify('Lien copié !');
      setManual(null);
      return true;
    } catch {
      setManual(url);
      return false;
    }
  }, [notify, url]);

  return (
    <div className="mt-4">
      <div className="flex justify-end">
        <ShareMenu
          url={url}
          text={text}
          title={campaign.name}
          onCopyLink={copyLink}
          onTrack={track}
        />
      </div>

      {manual && (
        <div className="mt-3">
          <label htmlFor="share-manual" className="text-xs font-medium text-gray-700">
            Copiez ce lien manuellement
          </label>
          <textarea
            id="share-manual"
            readOnly
            value={manual}
            rows={3}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-1.5 w-full rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-[12px] leading-relaxed text-gray-700"
          />
        </div>
      )}
    </div>
  );
}
