'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ParticipantJourney } from '@/components/participant/participant-journey';
import { backend } from '@/lib/backend';
import type { GalleryItem } from '@/lib/types';

/**
 * Page participant par lien privé — `/d/[token]`.
 *
 * Elle se distingue de la page publique par une seule chose : la campagne est
 * chargée à partir de son jeton, et le partage social est **désactivé**.
 *
 * Le partage est fermé ici volontairement, et pas par prudence excessive : le
 * jeton *est* le secret d'accès à la campagne. Proposer « Partager » depuis cette
 * page publierait ce secret, et transformerait un lien privé en lien public sans
 * que personne ne l'ait décidé.
 *
 * Le parcours lui-même est le même composant que la page publique : filtre,
 * texte et export s'y comportent à l'identique.
 */
export default function PrivateParticipantPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [campaign, setCampaign] = useState<GalleryItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let alive = true;

    void backend.getPrivateCampaign(token).then((found) => {
      if (!alive) return;
      setCampaign(found);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [token]);

  return <ParticipantJourney campaign={campaign} loading={loading} sharing={false} />;
}
