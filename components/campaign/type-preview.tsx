'use client';

import { Play } from 'lucide-react';
import type { CampaignKind } from '@/lib/types';

/**
 * Les trois aperçus du sélecteur de type.
 *
 * Ils ne montrent pas une capture de l'éditeur : ils répondent à une seule
 * question — « qu'est-ce que mon participant va faire ? ». C'est pour ça qu'ils
 * sont dessinés en CSS plutôt que générés : un aperçu doit rester juste même
 * quand l'éditeur change, et il n'a pas besoin d'être fidèle au pixel.
 *
 * Le gabarit est volontairement vertical (3:4) dans les trois cas : c'est le
 * format où la différence entre les trois modes se lit le plus vite.
 */

/* ------------------------------------------------------------------ */
/* Briques communes                                                    */
/* ------------------------------------------------------------------ */

/** Silhouette neutre : suggère « la photo du participant » sans photo. */
function PhotoFill() {
  return (
    <svg
      viewBox="0 0 120 160"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <rect width="120" height="160" fill="#E7E5E4" />
      <circle cx="60" cy="64" r="23" fill="#D6D3D1" />
      <path d="M16 160c0-25 20-41 44-41s44 16 44 41z" fill="#D6D3D1" />
    </svg>
  );
}

/** Wordmark de marque, pour que l'aperçu parle de Campagnes et pas d'un cadre anonyme. */
function Mark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo-white.png" alt="" className={className} />
  );
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-gray-100">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cadre photo — mode Cadre                                            */
/* ------------------------------------------------------------------ */

/**
 * La photo remplit tout, le cadre se contente de la traverser : bandeau haut et
 * bandeau bas opaques, milieu transparent. C'est exactement ce que produit le
 * mode Cadre du descripteur.
 */
export function PhotoFramePreview() {
  return (
    <Stage>
      <PhotoFill />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-ink px-3 py-2">
        <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.1em] text-white">
          Rentrée 2027
        </span>
        <Mark className="h-3.5 w-auto opacity-90" />
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-ink px-3 py-2">
        <span className="text-[10px] font-medium text-white/80">#rentree2027</span>
      </div>
    </Stage>
  );
}

/* ------------------------------------------------------------------ */
/* Cadre vidéo — mode Cadre, avec animation                            */
/* ------------------------------------------------------------------ */

/**
 * Même composition que le cadre photo, plus trois indices de mouvement :
 * le logo qui flotte, un repère d'enregistrement, et une barre de lecture.
 * Le but est de montrer qu'un élément du cadre bouge — pas de lire une vidéo.
 */
export function VideoFramePreview() {
  return (
    <Stage>
      <PhotoFill />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-ink px-3 py-2">
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.1em] text-white">
          <span
            className="size-1.5 rounded-full bg-coral motion-reduce:animate-none animate-pulse"
            aria-hidden
          />
          En direct
        </span>
        <Mark className="h-3.5 w-auto opacity-90" />
      </div>

      {/* L'élément qui bouge : c'est lui qui dit « animé ». */}
      <span className="absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 animate-float items-center justify-center rounded-full bg-white/90 motion-reduce:animate-none">
        <Play className="size-3.5 translate-x-[1px] text-ink" strokeWidth={2.5} aria-hidden />
      </span>

      <div className="absolute inset-x-0 bottom-0 bg-ink px-3 py-2">
        {/* Barre de lecture neutre : le dégradé reste réservé au CTA (§9). */}
        <div className="h-0.5 w-full overflow-hidden rounded-pill bg-white/25">
          <div className="h-full w-2/3 rounded-pill bg-white/80" />
        </div>
      </div>
    </Stage>
  );
}

/* ------------------------------------------------------------------ */
/* Photo sur fond — mode Fond                                          */
/* ------------------------------------------------------------------ */

/**
 * Ici le décor existe **avant** la photo : il occupe tout, et la photo vient
 * s'asseoir dans une zone au centre. C'est la différence de fond avec les deux
 * autres modes, et c'est ce que l'aperçu doit rendre évident.
 */
export function BackgroundFramePreview() {
  return (
    <Stage>
      <div className="absolute inset-0 bg-ink" />

      {/* Décor : aplats et halo, sans jamais un second dégradé. */}
      <div className="absolute -right-6 -top-6 size-24 rounded-full bg-purple/25" aria-hidden />
      <div className="absolute -bottom-8 -left-8 size-28 rounded-full bg-coral/20" aria-hidden />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 py-2.5">
        <Mark className="h-3.5 w-auto opacity-90" />
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">
          2027
        </span>
      </div>

      {/* La zone photo : c'est là que le participant dépose son image. */}
      <div className="absolute inset-x-6 top-1/2 -translate-y-1/2">
        <div className="relative aspect-square w-full overflow-hidden rounded-sm ring-2 ring-white/25">
          <PhotoFill />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 px-3 py-2.5 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
          Gala 2027
        </span>
      </div>
    </Stage>
  );
}

/* ------------------------------------------------------------------ */
/* Sélecteur                                                           */
/* ------------------------------------------------------------------ */

export function CampaignTypePreview({ kind }: { kind: CampaignKind }) {
  switch (kind) {
    case 'video_frame':
      return <VideoFramePreview />;
    case 'background_frame':
      return <BackgroundFramePreview />;
    default:
      return <PhotoFramePreview />;
  }
}
