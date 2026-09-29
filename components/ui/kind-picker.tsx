'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { KIND_SPECS } from '@/lib/campaign-kinds';
import type { CampaignKind } from '@/lib/types';

/**
 * Que va faire votre communauté ?
 *
 * Une seule question, trois réponses possibles, décrites par ce que le
 * participant fera — jamais par un réglage technique. Le vocabulaire est celui
 * du descripteur (« cadre », « fond ») : le créateur retrouve exactement le
 * même mot dans l'éditeur juste après.
 */
export function KindPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: CampaignKind;
  onChange: (kind: CampaignKind) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Type de campagne" className="grid gap-3 sm:grid-cols-3">
      {KIND_SPECS.map((spec) => {
        const active = value === spec.id;
        const Icon = spec.icon;

        return (
          <button
            key={spec.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(spec.id)}
            className={cn(
              'group relative flex flex-col items-start gap-2 rounded-lg border bg-white px-4 py-4 text-left',
              'transition-all duration-200 ease-brand disabled:opacity-50',
              active
                ? 'border-transparent ring-brand-gradient shadow-sm'
                : 'border-gray-200 hover:border-gray-400',
            )}
          >
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-md transition-colors duration-200',
                active ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 group-hover:bg-gray-100',
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
            </span>

            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold leading-tight">{spec.label}</span>
              <span className="text-xs text-gray-500">{spec.usage}</span>
              <span className="mt-1 text-[12px] leading-relaxed text-gray-400">{spec.detail}</span>
            </span>

            {active && (
              <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-brand-gradient">
                <Check className="size-3 text-white" strokeWidth={3} aria-hidden />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
