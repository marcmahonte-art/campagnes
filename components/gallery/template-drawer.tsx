'use client';

import { ArrowRight, BadgeCheck, ExternalLink, Heart, Play, Users } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { GalleryPreview } from './gallery-preview';
import { CreatorAvatar } from './creator-avatar';
import { kindSpec } from '@/lib/campaign-kinds';
import { ratioSpec } from '@/lib/ratios';
import { compactCount, relativeDate } from '@/lib/gallery';
import { useSession } from '@/lib/backend/session';
import type { GalleryItem } from '@/lib/types';

/**
 * Aperçu d'un template, ouvert depuis la galerie.
 *
 * L'aperçu est volontairement plus grand que la carte : c'est le moment où le
 * visiteur décide. Il ne porte aucun réglage — seulement ce qu'il faut pour
 * décider, et une action.
 *
 * Deux sorties, dans cet ordre :
 *
 * 1. « Utiliser ce cadre » — le parcours participant, sans compte. C'est
 *    l'action qui aboutit le plus vite à un visuel téléchargeable.
 * 2. « Créer ma campagne à partir de ce cadre » — pour un créateur qui veut
 *    repartir du cadre pour sa propre campagne. Réservé aux comptes connectés :
 *    la copie du cadre se fait dans *son* espace, elle exige donc une session.
 */
export function TemplateDrawer({
  item,
  onClose,
}: {
  item: GalleryItem | null;
  onClose: () => void;
}) {
  const { user } = useSession();

  if (!item) return null;

  const spec = kindSpec(item.kind);
  const ratio = ratioSpec(item.ratio);
  const creatorName = item.creator?.org_name || (item.creator ? `@${item.creator.username}` : null);
  const isVideo = item.kind === 'video_frame' || Boolean(item.previewVideo);
  const usages = item.usageCount ?? 0;
  const likes = item.likesCount ?? 0;

  const fromHref = `/campaigns/new?from=${encodeURIComponent(item.slug)}`;

  return (
    <Drawer
      open
      onClose={onClose}
      title={item.name}
      description={creatorName ? `Proposé par ${creatorName}` : undefined}
      footer={
        <div className="flex flex-col gap-2.5">
          <ButtonLink href={`/c/${item.slug}`} variant="primary" size="lg" className="w-full">
            Utiliser ce cadre
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>

          {user ? (
            <ButtonLink href={fromHref} variant="secondary" size="md" className="w-full">
              Créer ma campagne à partir de ce cadre
            </ButtonLink>
          ) : (
            <ButtonLink
              href={`/signup?next=${encodeURIComponent(fromHref)}`}
              variant="ghost"
              size="md"
              className="w-full"
            >
              Créer ma propre campagne
            </ButtonLink>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-50">
          <div className="absolute inset-0 p-6">
            <GalleryPreview
              src={item.frame?.thumbnail_url ?? null}
              alt={`Aperçu de la campagne ${item.name}`}
              watermark={item.creator?.watermark ?? true}
              fallback={{
                width: item.ratio === '16:9' ? 200 : item.ratio === '9:16' ? 112 : 150,
                height: item.ratio === '16:9' ? 112 : item.ratio === '9:16' ? 200 : 150,
              }}
            />
          </div>

          {isVideo && (
            <span className="absolute left-3 top-3 flex items-center gap-1 rounded-pill bg-ink/80 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              <Play className="size-2.5 fill-current" aria-hidden />
              Vidéo
            </span>
          )}
        </div>

        {/* Ce que le participant devra déposer — dit en clair, sans réglage. */}
        <dl className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 p-4">
          <div>
            <dt className="text-[12px] uppercase tracking-[0.08em] text-gray-500">Type</dt>
            <dd className="mt-0.5 text-[14px] font-medium">{spec.label}</dd>
          </div>
          <div>
            <dt className="text-[12px] uppercase tracking-[0.08em] text-gray-500">Format</dt>
            <dd className="mt-0.5 text-[14px] font-medium">{ratio.label}</dd>
          </div>
          <div>
            <dt className="text-[12px] uppercase tracking-[0.08em] text-gray-500">À déposer</dt>
            <dd className="mt-0.5 text-[14px] font-medium">{spec.formats.join(' ou ')}</dd>
          </div>
          <div>
            <dt className="text-[12px] uppercase tracking-[0.08em] text-gray-500">Publié</dt>
            <dd className="mt-0.5 text-[14px] font-medium">{relativeDate(item.created_at)}</dd>
          </div>
        </dl>

        <p className="text-[14px] leading-relaxed text-gray-500">{spec.usage}</p>

        {creatorName && (
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-4">
            <CreatorAvatar
              name={item.creator?.org_name || item.creator?.username || '?'}
              logoUrl={item.creator?.logo_url ?? null}
              size={36}
            />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[14px] font-medium">
                <span className="truncate">{creatorName}</span>
                {item.isOfficial && (
                  <BadgeCheck className="size-4 shrink-0 text-purple" aria-label="Créateur officiel" />
                )}
              </p>
              {item.creator && (
                <a
                  href={`/u/${item.creator.username}`}
                  className="text-[13px] text-gray-500 underline underline-offset-4 transition-colors hover:text-ink"
                >
                  Voir ses campagnes
                </a>
              )}
            </div>
          </div>
        )}

        {/* Compteurs — affichés seulement s'ils mesurent quelque chose. */}
        {(usages > 0 || likes > 0) && (
          <div className="flex items-center gap-5 text-[13px] text-gray-500">
            {usages > 0 && (
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden />
                {compactCount(usages)} utilisations
              </span>
            )}
            {likes > 0 && (
              <span className="flex items-center gap-1.5">
                <Heart className="size-3.5" aria-hidden />
                {compactCount(likes)}
              </span>
            )}
          </div>
        )}

        <ButtonLink
          href={`/c/${item.slug}`}
          variant="ghost"
          size="sm"
          className="self-start px-0 text-gray-500 hover:text-ink"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          Voir la campagne
        </ButtonLink>
      </div>
    </Drawer>
  );
}
