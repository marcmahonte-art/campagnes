'use client';

import { useEffect, useState } from 'react';
import { backend } from '@/lib/backend';
import { GalleryCard } from '@/components/gallery/gallery-card';
import { GallerySkeleton } from '@/components/gallery/gallery-skeleton';
import type { GalleryItem } from '@/lib/types';

/**
 * Les campagnes à la une, en données réelles.
 *
 * Ce composant remplace un tableau statique qui affichait quatre campagnes
 * codées en dur, avec des compteurs inventés — « 12 400 likes », « 3 200
 * utilisations » — et des aperçus réduits au nom de la campagne sur un fond
 * gris. Ces chiffres n'ont jamais mesuré quoi que ce soit, et ils étaient
 * visibles par tout visiteur sur la page d'accueil.
 *
 * On lit désormais la base, et on affiche le **vrai** visuel : c'est
 * `GalleryCard` qui le compose, le même composant que la galerie. L'accueil et
 * la galerie ne peuvent donc plus diverger sur la façon de montrer une
 * campagne.
 *
 * Le tri est par utilisations, parce que c'est ce que la section promet —
 * « les plus populaires du moment ». À volume égal, les likes départagent.
 */
export function TrendingCampaigns({ limit = 4 }: { limit?: number }) {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;

    void backend
      .listGallery()
      .then((list) => {
        if (!alive) return;
        setItems(list);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    /*
     * Une panne ne doit pas laisser un trou dans la page d'accueil. On ne
     * montre pas de message d'erreur ici : la galerie, juste en dessous, est
     * le vrai chemin vers ces campagnes.
     */
    return null;
  }

  // Tant que la base répond, on occupe la place avec des silhouettes de même
  // taille : la mise en page ne saute pas quand les cartes arrivent.
  if (items === null) {
    return (
      <div className="mt-10">
        {/* Le squelette porte sa propre grille : on ne l_emballe pas. */}
        <GallerySkeleton count={limit} />
      </div>
    );
  }

  const trending = [...items]
    .sort((a, b) => {
      const usage = (b.usageCount ?? 0) - (a.usageCount ?? 0);
      if (usage !== 0) return usage;
      return (b.likesCount ?? 0) - (a.likesCount ?? 0);
    })
    .slice(0, limit);

  /*
   * Aucune campagne publiée : on ne fabrique rien. Le titre reste visible avec
   * son lien vers la galerie, et c'est tout. Un emplacement vide se remarque,
   * mais il ne ment pas.
   */
  if (trending.length === 0) return null;

  return (
    <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
      {trending.map((item) => (
        <GalleryCard
          key={item.id}
          item={item}
          onOpen={() => {
            // L'accueil n'a pas de drawer : on mène à la campagne, qui est le
            // geste utile depuis une page d'accueil.
            window.location.assign(`/c/${item.slug}`);
          }}
        />
      ))}
    </div>
  );
}