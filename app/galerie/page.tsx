'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Images } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import { backend } from '@/lib/backend';
import { ratioSpec } from '@/lib/ratios';
import type { GalleryItem } from '@/lib/types';

/**
 * Galerie publique — toutes les campagnes publiées, tous créateurs confondus.
 *
 * Elle sert deux choses : montrer ce que la plateforme produit, et permettre à un
 * créateur de « reprendre » une campagne existante (§ « utiliser une campagne
 * existante », ouvert à toutes les formules).
 */
export default function GaleriePage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <>
      <SiteHeader />

      <section className="border-b border-gray-200 bg-gray-50">
        <div className="container-shell py-16 md:py-20">
          <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            <Images className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
            Galerie
          </p>
          <h1 className="mt-3 max-w-3xl text-[32px] font-bold leading-tight md:text-[44px]">
            Les campagnes publiées sur Campagnes.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-gray-500">
            Chaque vignette correspond à un cadre réel. Ouvrez-en une pour voir le descripteur qui
            la décrit — c’est lui qui garantit un rendu identique pour tous les participants.
          </p>
        </div>
      </section>

      <section className="container-shell py-16 md:py-20">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="size-5 text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-4 p-12 text-center">
            <Images className="size-6 text-gray-300" strokeWidth={1.5} aria-hidden />
            <p className="text-sm text-gray-500">
              Aucune campagne publiée pour le moment. Soyez la première organisation à en publier
              une.
            </p>
            <ButtonLink href="/signup" variant="primary" size="sm">
              Créer ma campagne
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const spec = ratioSpec(item.ratio);
              return (
                <Card key={item.id} className="flex flex-col overflow-hidden" interactive>
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-gray-100 p-4">
                    {item.frame?.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.frame.thumbnail_url}
                        alt={`Aperçu de la campagne ${item.name}`}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="rounded-sm border-2 border-gray-300 bg-white"
                        style={{
                          width: item.ratio === '16:9' ? 150 : item.ratio === '9:16' ? 84 : 112,
                          height: item.ratio === '16:9' ? 84 : item.ratio === '9:16' ? 150 : 112,
                        }}
                      />
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-[15px] font-semibold leading-snug">{item.name}</h2>
                      <span className="shrink-0 rounded-pill border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500">
                        {spec.label}
                      </span>
                    </div>

                    {item.creator ? (
                      <Link
                        href={`/@${item.creator.username}`}
                        className="text-[13px] text-gray-500 transition-colors hover:text-ink"
                      >
                        {item.creator.org_name || `@${item.creator.username}`}
                      </Link>
                    ) : (
                      <span className="text-[13px] text-gray-400">Créateur inconnu</span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
