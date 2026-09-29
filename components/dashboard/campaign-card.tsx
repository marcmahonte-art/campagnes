'use client';

import Link from 'next/link';
import { ArrowRight, Frame } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { kindSpec } from '@/lib/campaign-kinds';
import { ratioSpec } from '@/lib/ratios';
import type { CampaignWithFrame } from '@/lib/types';

/**
 * Vignette de campagne — sobre, sans surcharge visuelle (§18 du design system).
 * Aperçu : la vignette si elle existe, sinon la silhouette du format choisi.
 */
export function CampaignCard({
  campaign,
  href,
}: {
  campaign: CampaignWithFrame;
  /**
   * Destination du clic. Par défaut l'éditeur, qui est privé — une page publique
   * doit donc pointer explicitement vers le parcours participant `/c/[slug]`,
   * sinon le visiteur tombe sur un écran de connexion.
   */
  href?: string;
}) {
  const spec = ratioSpec(campaign.ratio);
  const aspect = `${spec.width} / ${spec.height}`;

  return (
    <Link
      href={href ?? `/campaigns/${campaign.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow duration-200 ease-brand hover:shadow-md"
    >
      <div className="relative border-b border-gray-200 bg-gray-50">
        <div className="flex h-40 items-center justify-center p-4">
          {campaign.frame?.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={campaign.frame.thumbnail_url}
              alt=""
              className="max-h-full max-w-full rounded-sm object-contain shadow-sm"
            />
          ) : (
            <div
              style={{ aspectRatio: aspect }}
              className="flex max-h-full items-center justify-center rounded-sm border border-dashed border-gray-300 bg-white"
            >
              <Frame className="size-5 text-gray-300" strokeWidth={1.75} aria-hidden />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{campaign.name}</h3>
          <StatusBadge status={campaign.status} />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-gray-500">
            {spec.label} · {kindSpec(campaign.kind).label}
          </span>
          <span className="flex items-center gap-1 text-[13px] font-medium text-ink transition-transform duration-200 ease-brand group-hover:translate-x-0.5">
            Ouvrir
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}
