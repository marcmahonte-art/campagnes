'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Images, SearchX } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Button, ButtonLink } from '@/components/ui/button';
import { CreateTemplateCard, GalleryCard } from '@/components/gallery/gallery-card';
import { GalleryFiltersBar } from '@/components/gallery/gallery-filters';
import { GallerySkeleton } from '@/components/gallery/gallery-skeleton';
import { TemplateDrawer } from '@/components/gallery/template-drawer';
import { useSession } from '@/lib/backend/session';
import { backend } from '@/lib/backend';
import { NO_FILTERS, activeFilterCount, filterGallery, type GalleryFilters } from '@/lib/gallery';
import type { GalleryItem } from '@/lib/types';

/**
 * Galerie publique — toutes les campagnes publiées, tous créateurs confondus.
 *
 * Elle sert deux choses : montrer ce que la plateforme produit, et permettre à
 * un créateur de repartir d'un cadre existant.
 *
 * Le filtre et le tri ne sont **pas** écrits ici : ils vivent dans
 * `lib/gallery.ts`. Cette page ne fait que décrire ce que le visiteur a demandé
 * et afficher le résultat, ce qui garantit que le compteur de résultats, la
 * grille et l'état vide racontent toujours la même histoire.
 */
export default function GaleriePage() {
  const router = useRouter();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<GalleryFilters>(NO_FILTERS);
  const [preview, setPreview] = useState<GalleryItem | null>(null);

  /*
   * La session décide si le cœur est actif. Elle est relue après le
   * chargement : un visiteur qui se connecte dans un autre onglet voit ainsi
   * ses campagnes deviennent « aimables » sans qu'il ait à recharger la page.
   */
  const { user } = useSession();

  useEffect(() => {
    let alive = true;
    void backend.listGallery().then((list) => {
      if (!alive) return;
      setItems(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  /*
   * Un like met à jour **la liste**, pas la carte.
   *
   * La carte garde son propre état pendant la frappe — c'est ce qui rend le
   * geste instantané — mais la liste est la source de vérité : sans cela, un
   * filtre « Populaire » ne reréordonnerait rien, et un like pose en haut de
   * l'écran resterait « vide » ailleurs.
   *
   * La modification est locale et instantanée : la base a déjà répondu, la
   * fonction RPC a renvoyé le compteur exact.
   */
  const applyLike = useCallback((campaignId: string, likesCount: number, likedByMe: boolean) => {
    setItems((current) =>
      current.map((item) =>
        item.id === campaignId ? { ...item, likesCount, likedByMe } : item,
      ),
    );
  }, []);

  const visible = useMemo(() => filterGallery(items, filters), [items, filters]);
  const filtering = activeFilterCount(filters) > 0 || filters.query.trim().length > 0;
  const galleryEmpty = !loading && items.length === 0;

  return (
    <>
      <SiteHeader />

      {/* ---------------- En-tête de page ---------------- */}
      <section className="border-b border-gray-200">
        <div className="container-shell py-10 md:py-12">
          <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            <Images className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
            Galerie
          </p>
          <h1 className="mt-3 text-[30px] font-bold leading-tight md:text-[38px]">
            Explorez les campagnes
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-gray-500">
            Découvrez des templates créés par la communauté et créez le vôtre.
          </p>
        </div>
      </section>

      {/* ---------------- Filtres ---------------- */}
      <section className="border-b border-gray-200 bg-white">
        <div className="container-shell py-5">
          <GalleryFiltersBar
            filters={filters}
            onChange={setFilters}
            items={items}
            resultCount={visible.length}
          />
        </div>
      </section>

      {/* ---------------- Résultats ---------------- */}
      <section className="container-shell py-10 md:py-12">
        <p aria-live="polite" className="mb-6 text-[13px] text-gray-500">
          {loading
            ? 'Chargement des campagnes…'
            : `${visible.length} ${visible.length === 1 ? 'campagne' : 'campagnes'}${
                filtering ? ' correspondante' + (visible.length === 1 ? '' : 's') : ''
              }`}
        </p>

        {loading ? (
          <GallerySkeleton />
        ) : visible.length === 0 ? (
          /* Deux vides très différents : une galerie sans rien, et une recherche
             sans résultat. Les confondre ferait croire que la plateforme est
             déserte alors qu'on a juste mal orthographié. */
          <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-gray-200 px-6 py-16 text-center">
            <SearchX className="size-6 text-gray-300" strokeWidth={1.5} aria-hidden />
            <div>
              <p className="text-[15px] font-semibold">
                {galleryEmpty ? 'Pas encore de template' : 'Aucun résultat'}
              </p>
              <p className="mt-1 text-[14px] text-gray-500">
                {galleryEmpty
                  ? 'Soyez la première organisation à en publier une.'
                  : 'Essayez une autre recherche ou créez votre propre campagne.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {filtering && !galleryEmpty && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setFilters(NO_FILTERS)}
                >
                  Effacer les filtres
                </Button>
              )}
              <ButtonLink href="/campaigns/new" variant="primary" size="sm">
                Créer un template →
              </ButtonLink>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 md:grid-cols-3 xl:grid-cols-4">
            {/* La tuile d'ajout n'a de sens que sur la galerie complète : dans un
                résultat de recherche, elle prendrait la place d'une réponse. */}
            {!filtering && <CreateTemplateCard onClick={() => router.push('/campaigns/new')} />}

            {visible.map((item) => (
              <GalleryCard
              key={item.id}
              item={item}
              onOpen={setPreview}
              connected={Boolean(user)}
              onLike={applyLike}
            />
            ))}
          </div>
        )}
      </section>

      <TemplateDrawer
          item={preview}
          onClose={() => setPreview(null)}
          onLike={applyLike}
        />

      <SiteFooter />
    </>
  );
}
