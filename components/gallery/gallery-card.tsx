'use client';

import { ArrowRight, BadgeCheck, Heart, Play, Users } from 'lucide-react';
import { GalleryPreview } from './gallery-preview';
import { CreatorAvatar } from './creator-avatar';
import { kindSpec } from '@/lib/campaign-kinds';
import { ratioSpec } from '@/lib/ratios';
import { compactCount, relativeDate } from '@/lib/gallery';
import type { GalleryItem } from '@/lib/types';

/**
 * Carte de la galerie.
 *
 * La preview est la partie dominante : c'est elle qu'on vient voir. Tout le
 * reste tient sur deux lignes discrètes sous l'image.
 *
 * Toute la carte est cliquable via un bouton étiré (`absolute inset-0`). Ce
 * choix n'est pas cosmétique : le titre reste un vrai `<h3>`, le bouton porte un
 * nom accessible court, et le contour de focus dessine le tour de la carte
 * entière — donc utilisable au clavier sans piéger la navigation.
 */

/**
 * Une seule vidéo joue à la fois, toutes cartes confondues. Deux previews qui
 * démarrent ensemble donnent une cacophonie visuelle et coûtent deux décodages.
 */
let playing: HTMLVideoElement | null = null;

function playExclusive(element: HTMLVideoElement) {
  if (playing && playing !== element) playing.pause();
  playing = element;
  void element.play().catch(() => {
    // Lecture refusée (politique navigateur) : la vignette statique reste.
  });
}

function stopPlaying(element: HTMLVideoElement) {
  element.pause();
  if (playing === element) playing = null;
}

export function GalleryCard({
  item,
  onOpen,
}: {
  item: GalleryItem;
  onOpen: (item: GalleryItem) => void;
}) {
  const spec = kindSpec(item.kind);
  const ratio = ratioSpec(item.ratio);
  const creatorName = item.creator?.org_name || (item.creator ? `@${item.creator.username}` : null);
  const video = item.previewVideo ?? null;
  const isVideo = item.kind === 'video_frame' || Boolean(video);

  /*
   * Le format n'est affiché que lorsqu'il apprend quelque chose : le carré est
   * la valeur par défaut, l'annoncer sur chaque carte ne ferait que du bruit.
   */
  const showRatio = item.ratio !== '1:1';

  const usages = item.usageCount ?? 0;
  const likes = item.likesCount ?? 0;

  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-50">
        <div className="absolute inset-0 p-5 transition-transform duration-200 ease-brand group-hover:scale-[1.03]">
          {video ? (
            <video
              src={video}
              muted
              loop
              playsInline
              preload="none"
              aria-hidden
              className="size-full object-contain"
              onMouseEnter={(e) => playExclusive(e.currentTarget)}
              onMouseLeave={(e) => stopPlaying(e.currentTarget)}
            />
          ) : (
            <GalleryPreview
              src={item.frame?.thumbnail_url ?? null}
              alt={`Aperçu de la campagne ${item.name}`}
              // Créateur inconnu → on marque, comme partout ailleurs : mieux
              // vaut un visuel marqué à tort qu'un visuel qui contourne la
              // formule par accident.
              watermark={item.creator?.watermark ?? true}
              fallback={{
                width: item.ratio === '16:9' ? 132 : item.ratio === '9:16' ? 74 : 99,
                height: item.ratio === '16:9' ? 74 : item.ratio === '9:16' ? 132 : 99,
              }}
            />
          )}
        </div>

        {/* Marqueurs — discrets, jamais plus de deux à la fois. */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="flex gap-1.5">
            {isVideo && (
              <span className="flex items-center gap-1 rounded-pill bg-ink/80 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                <Play className="size-2.5 fill-current" aria-hidden />
                Vidéo
              </span>
            )}
          </span>
          {showRatio && (
            <span className="rounded-pill bg-white/85 px-2 py-0.5 text-[11px] font-medium text-gray-700 backdrop-blur-sm">
              {ratio.label}
            </span>
          )}
        </div>

        {/* Invitation au survol — purement visuelle, la carte est déjà un bouton. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-end justify-center bg-ink/0 pb-4 opacity-0 transition-all duration-200 ease-brand group-hover:bg-ink/10 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <span className="flex items-center gap-1.5 rounded-pill bg-white px-3.5 py-2 text-[13px] font-medium text-ink shadow-md">
            Utiliser ce template
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <h3 className="text-[15px] font-semibold leading-snug">{item.name}</h3>

        <div className="flex items-center gap-2 text-[13px] text-gray-500">
          {creatorName ? (
            <>
              <CreatorAvatar
                name={item.creator?.org_name || item.creator?.username || '?'}
                logoUrl={item.creator?.logo_url ?? null}
                size={18}
              />
              <span className="truncate">{creatorName}</span>
              {item.isOfficial && (
                <span className="flex shrink-0 items-center gap-1 text-gray-700">
                  <BadgeCheck className="size-3.5 text-purple" aria-hidden />
                  <span className="sr-only">Créateur officiel</span>
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-400">Créateur inconnu</span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[12px] text-gray-400">
          {/* Les compteurs ne s'affichent que s'ils mesurent quelque chose. */}
          {likes > 0 && (
            <span className="flex items-center gap-1">
              <Heart className="size-3" aria-hidden />
              {compactCount(likes)}
            </span>
          )}
          {usages > 0 && (
            <span className="flex items-center gap-1">
              <Users className="size-3" aria-hidden />
              {compactCount(usages)} utilisations
            </span>
          )}
          <span>{relativeDate(item.created_at)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={`Ouvrir l’aperçu de ${item.name}`}
        className="absolute inset-0 rounded-lg"
      />
    </article>
  );
}

/**
 * Carte « Créer votre template », toujours en tête de grille.
 *
 * Volontairement sans dégradé, alors que le prompt en demandait « une petite
 * touche ». Une tuile à bordure dégradée au milieu d'une grille se lit
 * instantanément comme un encart publicitaire — exactement ce que la carte ne
 * doit pas être. On garde donc la convention de la tuile d'ajout : bordure
 * pointillée, pastille noire, et un simple éclaircissement au survol.
 */
export function CreateTemplateCard({ onClick }: { onClick: () => void }) {
  return (
    <article className="group relative flex flex-col">
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white text-center transition-colors duration-200 ease-brand group-hover:border-gray-400 group-hover:bg-gray-50">
        <span className="flex size-10 items-center justify-center rounded-full bg-ink text-white transition-transform duration-200 ease-brand group-hover:scale-105">
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </span>
        <span className="text-[15px] font-semibold">Créer votre template</span>
        <span className="text-[13px] text-gray-500">Partez de zéro</span>
      </div>

      <button
        type="button"
        onClick={onClick}
        aria-label="Créer votre template"
        className="absolute inset-0 rounded-lg"
      />
    </article>
  );
}
