'use client';

import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import {
  formatPackPrice,
  formatPackVolume,
  formatPricePerParticipant,
  type CreditPack,
} from '@/lib/credits';

/**
 * Un pack de distribution. Le prix par participant est mis en avant : c'est le
 * seul chiffre qui permette de comparer les volumes honnêtement.
 */
export function PackCard({
  pack,
  pending = false,
  onBuy,
  disabled = false,
  disabledReason,
  owned,
}: {
  pack: CreditPack;
  pending?: boolean;
  onBuy?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Nombre de participations déjà en solde — affiché comme repère. */
  owned?: number;
}) {
  const onQuote = pack.participants === null;
  const highlight = pack.highlight ?? false;

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border bg-white p-5',
        highlight ? 'border-transparent ring-brand-gradient shadow-sm' : 'border-gray-200',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{pack.name}</h3>
        {highlight && (
          <span className="rounded-pill bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
            Meilleur rapport
          </span>
        )}
      </div>

      <p className="mt-3 text-[26px] font-bold leading-none">
        {formatPackVolume(pack)}
        <span className="ml-1.5 text-[13px] font-medium text-gray-500">participants</span>
      </p>

      <p className="mt-3 text-[13px] leading-relaxed text-gray-500">{pack.description}</p>

      <dl className="mt-4 flex flex-col gap-1.5 border-t border-gray-200 pt-4 text-[12px]">
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">Prix</dt>
          <dd className="font-semibold text-gray-900">{formatPackPrice(pack)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-gray-500">Par participant</dt>
          <dd className="text-gray-700">{formatPricePerParticipant(pack)}</dd>
        </div>
        {owned !== undefined && (
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">Déjà en solde</dt>
            <dd className="flex items-center gap-1 text-gray-700">
              {owned > 0 && <Check className="size-3.5 text-success" aria-hidden />}
              {new Intl.NumberFormat('fr-FR').format(owned)}
            </dd>
          </div>
        )}
      </dl>

      {onBuy && (
        <div className="mt-5">
          <Button
            variant={highlight ? 'primary' : 'ghost'}
            className="w-full"
            disabled={pending || disabled || onQuote}
            onClick={onBuy}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Traitement…
              </>
            ) : onQuote ? (
              'Sur devis'
            ) : (
              <>
                Acheter
                <ArrowRight className="size-4" aria-hidden />
              </>
            )}
          </Button>
          {disabledReason && (
            <p className="mt-2 text-[12px] leading-snug text-gray-500">{disabledReason}</p>
          )}
        </div>
      )}

      {onQuote && !onBuy && (
        <p className="mt-4 text-[12px] leading-snug text-gray-500">
          Au-delà de 10 000 participants, les conditions sont adaptées à votre campagne.
        </p>
      )}
    </div>
  );
}
