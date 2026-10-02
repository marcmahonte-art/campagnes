'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Flame } from 'lucide-react';
import { backend } from '@/lib/backend';
import { GalleryCard } from '@/components/gallery/gallery-card';
import { GallerySkeleton } from '@/components/gallery/gallery-skeleton';
import { compactCount } from '@/lib/gallery';
import { kindSpec } from '@/lib/campaign-kinds';
import { CreatorAvatar } from '@/components/gallery/creator-avatar';
import { GalleryPreview } from '@/components/gallery/gallery-preview';
import { shouldWatermark } from '@/lib/watermark-policy';
import type { GalleryItem } from '@/lib/types';

/**
 * « Explorez nos templates », en données réelles.
 *
 * Remplace une liste de cinq campagnes écrites en dur — « Journée de la
 * Femme », « 2 400 utilisations » — dont aucun aperçu n'était une image mais
 * le nom de la campagne sur un fond gris.
 *
 * La grille est ici plus dense que celle de la galerie (cinq colonnes plutôt
 * que quatre) : sur une page d'accueil, c'est un aperçu de l'offre, pas une
 * liste à parcourir. Le visuel est néanmoins composé par `GalleryPreview`, le
 * composant exact de la galerie — un même cadre ne peut pas s'afficher
 * différemment selon la page où on le regarde.
 *
 * On trie par **création décroissante**, pas par popularité : la section parle
 * de « templates », pas de « meilleures ventes ». Une campagne de deux
 * téléchargements n'est pas moins vraie qu'une autre, elle est simplement
 * récente.
 */
export function TrendingTemplates({ limit = 5 }: { limit?: number }) {
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

  if (failed) return null;

  if (items === null) {
    return (
      <div className="mt-8">
        <GallerySkeleton count={limit} />
      </div>
    );
  }

  const recent = [...items]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);

  if (recent.length === 0) return null;

  return (
    <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
      {recent.map((item) => (
        <CompactTemplateCard key={item.id} item={item} />
      ))}
    </div>
  );
}

/**
 * La carte dense de la page d'accueil.
 *
 * Elle est distincte de `GalleryCard` pour une seule raison : cinq colonnes
 * n'ont pas la place du bouton de survol ni des compteurs complets. Tout le
 * reste — la vignette, le créateur, le format — vient des mêmes composants.
 *
 * On ne montre pas de compteur ici : à cette largeur, « 12,4k » se lit mais
 * « 1 200 utilisations » ne rentre pas, et un chiffre à moitié coupé vaut
 * moins que pas de chiffre. Les compteurs restent dans la galerie.
 */
function CompactTemplateCard({ item }: { item: GalleryItem }) {
  const creatorName =
    item.creator?.org_name || (item.creator ? `@${item.creator.username}` : null);
  const kind = kindSpec(item.kind);

  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-50">
        {/* La vignette est ajustée dans la zone, jamais recadrée. */}
        <div className="absolute inset-0 p-3 transition-transform duration-200 ease-brand group-hover:scale-[1.03]">
          <GalleryPreview
            src={item.frame?.thumbnail_url ?? null}
            alt={`Aperçu de la campagne ${item.name}`}
            title={item.name}
            watermark={shouldWatermark({
              access: 'public',
              creatorWatermark: item.creator?.watermark ?? true,
            })}
          />
        </div>

        {/* Le format n'est affiché que s'il apprend quelque chose. */}
        {item.ratio !== '1:1' && (
          <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-pill bg-white/85 px-2 py-0.5 text-[11px] font-medium text-gray-700 backdrop-blur-sm">
            {item.ratio}
          </span>
        )}

        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-end justify-center bg-ink/0 pb-3 opacity-0 transition-all duration-200 ease-brand group-hover:bg-ink/10 group-hover:opacity-100"
        >
          <span className="flex items-center gap-1.5 rounded-pill bg-white px-3 py-1.5 text-[12px] font-medium text-ink shadow-md">
            Utiliser
            <ArrowRight className="size-3" aria-hidden />
          </span>
        </span>
      </div>

      <div className="mt-2.5 flex flex-col gap-1">
        <h3 className="truncate text-[14px] font-semibold leading-snug">{item.name}</h3>
        <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
          <CreatorAvatar
            name={item.creator?.org_name || item.creator?.username || '?'}
            logoUrl={item.creator?.logo_url ?? null}
            size={16}
          />
          <span className="truncate">{creatorName ?? 'Créateur inconnu'}</span>
        </div>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
          <Flame className="size-2.5" aria-hidden />
          {kind.label}
        </span>
      </div>

      <a
        href={`/c/${item.slug}`}
        className="absolute inset-0 rounded-lg"
        aria-label={`Utiliser le template ${item.name}`}
      />
    </article>
  );
}