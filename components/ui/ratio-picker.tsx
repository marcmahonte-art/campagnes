'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { RATIO_LIST } from '@/lib/ratios';
import type { Ratio } from '@/lib/types';

/**
 * Choix du format — en langage naturel, jamais une résolution technique (§12).
 * Chaque option dessine la forme réelle du cadre pour que le choix soit immédiat.
 */
export function RatioPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Ratio;
  onChange: (ratio: Ratio) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Format de la campagne" className="grid grid-cols-3 gap-3">
      {RATIO_LIST.map((spec) => {
        const active = value === spec.id;
        // Hauteur de la vignette constante : seule la largeur varie avec le ratio.
        const height = 56;
        const width =
          spec.id === '1:1' ? 56 : spec.id === '16:9' ? Math.round((56 * 16) / 9) : Math.round((56 * 9) / 16);

        return (
          <button
            key={spec.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(spec.id)}
            className={cn(
              'group relative flex flex-col items-center gap-3 rounded-lg border bg-white px-2 py-4',
              'transition-all duration-200 ease-brand disabled:opacity-50',
              active
                ? 'border-transparent ring-brand-gradient shadow-sm'
                : 'border-gray-200 hover:border-gray-400',
            )}
          >
            <span className="flex h-[56px] w-full items-center justify-center">
              <span
                aria-hidden
                style={{ width, height }}
                className={cn(
                  'rounded-sm border-2 transition-colors duration-200',
                  active ? 'border-purple bg-purple/5' : 'border-gray-200 bg-gray-50 group-hover:border-gray-400',
                )}
              />
            </span>

            <span className="flex flex-col items-center gap-0.5">
              <span className="text-[15px] font-semibold leading-tight">{spec.label}</span>
              <span className="text-xs text-gray-500">{spec.id}</span>
            </span>

            {active && (
              <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-brand-gradient">
                <Check className="size-3 text-white" strokeWidth={3} aria-hidden />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
