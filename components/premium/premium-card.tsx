'use client';

import { ArrowRight, BadgeCheck, Image as ImageIcon, Images, Lock } from 'lucide-react';
import { kindSpec } from '@/lib/campaign-kinds';
import { ratioSpec } from '@/lib/ratios';
import type { PremiumCampaign } from '@/lib/premium';

/**
 * Carte d'une campagne événementielle.
 *
 * Elle est **plus grande et plus silencieuse** que la carte de la galerie
 * générale : le visuel occupe la quasi-totalité de la surface, et trois lignes
 * seulement l'accompagnent. Le visiteur doit comprendre la carte en moins de
 * deux secondes — il n'y a donc rien de plus à lire, et surtout rien à
 * configurer.
 *
 * **Le bouton dit la vérité.** Tant que le descripteur du modèle n'existe pas,
 * le CTA est éteint et annonce que le visuel est en préparation. Un bouton actif
 * qui mènerait à un cadre vide ferait douter du produit entier, alors qu'un
 * bouton éteint et explicite ne coûte qu'un peu de patience.
 */

const KIND_ICONS = {
  photo_frame: ImageIcon,
  video_frame: ImageIcon,
  background_frame: Images,
} as const;

export function PremiumCard({ campaign }: { campaign: PremiumCampaign }) {
  const spec = kindSpec(campaign.kind);
  const ratio = ratioSpec(campaign.ratio);
  /** Rapport largeur/hauteur, calculé depuis la seule source de vérité. */
  const ratioValue = ratio.width / ratio.height;
  const Icon = KIND_ICONS[campaign.kind] ?? ImageIcon;
  const ready = campaign.templateId !== null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-all duration-200 ease-brand hover:-translate-y-0.5 hover:shadow-md">
      {/* ---------------- Aperçu ----------------
          `aspect-[4/3]` réserve la place : la grille ne bouge pas quand les
          visuels arriveront, donc aucune surprise de mise en page (CLS). */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
        {campaign.previewImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.previewImage}
            alt={`Aperçu de la campagne ${campaign.title}`}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-200 ease-brand group-hover:scale-[1.02]"
          />
        ) : (
          /* Emplacement vide, assumé. On montre la forme du visuel à venir —
             son format réel — plutôt qu'un rectangle gris anonyme. */
          <div className="flex size-full flex-col items-center justify-center gap-2 text-center">
            <span
              aria-hidden
              className="rounded border-2 border-dashed border-gray-300 bg-white"
              style={{
                width: ratioValue > 1 ? 96 : ratioValue < 1 ? 54 : 72,
                height: ratioValue > 1 ? 54 : ratioValue < 1 ? 96 : 72,
              }}
            />
            <span className="text-[12px] font-medium text-gray-400">Visuel à venir</span>
          </div>
        )}

        {/* Badge — un seul à la fois, et seulement s'il apprend quelque chose. */}
        {campaign.badge && (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-pill bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm backdrop-blur-sm">
            <BadgeCheck className="size-3 text-purple" aria-hidden />
            {campaign.badge}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {/* Nature de l'accueil média — le vocabulaire vient de `kindSpec()`,
            donc il reste identique à celui de l'éditeur. */}
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500">
          <Icon className="size-3.5" aria-hidden />
          {spec.label}
        </span>

        <h3 className="mt-1.5 text-[16px] font-semibold leading-snug">{campaign.title}</h3>

        {campaign.description && (
          <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{campaign.description}</p>
        )}

        {/* Le CTA est poussé en bas : les cartes d'une même ligne s'alignent,
            quelle que soit la longueur du titre. */}
        <div className="mt-4 flex-1" />

        {ready ? (
          <a
            href={`/c/${campaign.id}`}
            className="flex h-11 items-center justify-center gap-2 rounded-pill bg-brand-gradient text-sm font-medium text-white transition-all duration-200 ease-brand hover:shadow-md active:scale-[.985]"
          >
            Utiliser ce template
            <ArrowRight className="size-4" aria-hidden />
          </a>
        ) : (
          <span
            aria-disabled="true"
            title="Le visuel de cette campagne est en préparation"
            className="flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-pill border border-gray-200 bg-gray-50 text-sm font-medium text-gray-400"
          >
            <Lock className="size-3.5" aria-hidden />
            Bientôt disponible
          </span>
        )}
      </div>
    </article>
  );
}
