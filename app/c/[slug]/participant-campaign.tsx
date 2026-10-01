'use client';

import { useEffect, useState } from 'react';
import { ParticipantJourney } from '@/components/participant/participant-journey';
import { backend } from '@/lib/backend';
import type { GalleryItem } from '@/lib/types';

/**
 * Chargeur de la page participant publique — `/c/[slug]`.
 *
 * Il ne fait qu'une chose : retrouver la campagne à partir de son adresse. Tout
 * le parcours vit dans `ParticipantJourney`, partagé avec le lien privé — deux
 * copies de cet écran finiraient par diverger, et le participant ne fait pas la
 * différence entre les deux.
 *
 * Le composant est **client** parce que tout le parcours l'est : lecture du
 * fichier, composition Fabric, export. La page serveur qui l'enveloppe
 * (`page.tsx`) ne sert qu'aux balises Open Graph, que les robots lisent avant
 * qu'une ligne de JavaScript ne s'exécute.
 */
export function ParticipantCampaign({ slug }: { slug: string }) {
  const [campaign, setCampaign] = useState<GalleryItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let alive = true;

    void backend.getPublicCampaign(slug).then((found) => {
      if (!alive) return;
      setCampaign(found);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [slug]);

  return <ParticipantJourney campaign={campaign} loading={loading} sharing />;
}
