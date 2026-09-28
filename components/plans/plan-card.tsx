'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import {
  FEATURE_LABELS,
  formatPlanPrice,
  planOf,
  type Plan,
  type PlanId,
} from '@/lib/plans';

/**
 * Pastille de formule. Free reste neutre et discrète ; les formules payantes
 * portent le liseré dégradé, seul marqueur « premium » du produit.
 */
export function PlanBadge({ plan, className }: { plan: PlanId | string | null; className?: string }) {
  const spec = planOf(plan);

  if (spec.id === 'free') {
    return (
      <Badge tone="neutral" className={className}>
        Free
      </Badge>
    );
  }

  return (
    <span
      className={cn(
        'ring-brand-gradient inline-flex items-center rounded-pill bg-white px-2.5 py-1 text-xs font-semibold text-ink',
        className,
      )}
    >
      {spec.name}
    </span>
  );
}

/**
 * Carte d'une formule. Elle ne liste que ce qui est INCLUS : les modules absents
 * sont portés par la matrice comparative, pour ne pas charger la carte.
 */
export function PlanCard({
  plan,
  current = false,
  pending = false,
  onSelect,
  disabledReason,
  ctaLabel,
}: {
  plan: Plan;
  /** Formule actuellement active sur le compte. */
  current?: boolean;
  pending?: boolean;
  /** Absent = carte informative (page publique), sans bouton d'action. */
  onSelect?: () => void;
  /** Renseigné = bouton désactivé, avec l'explication affichée dessous. */
  disabledReason?: string;
  ctaLabel?: string;
}) {
  const featured = plan.highlight ?? false;

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-lg border bg-white p-6',
        featured ? 'border-transparent ring-brand-gradient shadow-md' : 'border-gray-200 shadow-sm',
      )}
    >
      {featured && (
        <span className="absolute -top-3 left-6 rounded-pill bg-brand-gradient px-2.5 py-1 text-[11px] font-semibold text-white">
          Le plus choisi
        </span>
      )}

      <header>
        <div className="flex items-center gap-2">
          <h3 className="text-[20px] font-semibold">{plan.name}</h3>
          {current && <Badge tone="published">Formule actuelle</Badge>}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{plan.tagline}</p>
      </header>

      <p className="mt-5 text-[28px] font-bold leading-none">
        {plan.priceFcfa === 0 ? (
          'Gratuit'
        ) : (
          <>
            {formatPlanPrice(plan).replace(' / mois', '')}
            <span className="ml-1 text-[13px] font-medium text-gray-500">/ mois</span>
          </>
        )}
      </p>

      <ul className="mt-6 flex flex-1 flex-col gap-2.5">
        {plan.features.length === 0 ? (
          <li className="text-[13px] leading-relaxed text-gray-500">
            Création de campagnes, galerie, 3 formats et lien de partage.
          </li>
        ) : (
          plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-[13px] leading-snug">
              <Check className="mt-0.5 size-4 shrink-0 text-purple" strokeWidth={2} aria-hidden />
              <span>{FEATURE_LABELS[feature]}</span>
            </li>
          ))
        )}
      </ul>

      <p className="mt-5 border-t border-gray-200 pt-4 text-[12px] leading-relaxed text-gray-500">
        Distribution facturée à l’usage, dans tous les plans.
      </p>

      {onSelect && (
        <div className="mt-4">
          <Button
            variant={featured ? 'primary' : 'ghost'}
            className="w-full"
            disabled={current || pending || Boolean(disabledReason)}
            onClick={onSelect}
          >
            {current
              ? 'Formule active'
              : pending
                ? 'Activation…'
                : (ctaLabel ?? `Passer en ${plan.name}`)}
          </Button>
          {disabledReason && (
            <p className="mt-2 text-[12px] leading-snug text-gray-500">{disabledReason}</p>
          )}
        </div>
      )}
    </div>
  );
}
