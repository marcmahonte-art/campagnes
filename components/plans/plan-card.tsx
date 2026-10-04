'use client';

import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import {
  PRICING_PLANS,
  getPlanPeriodPrice,
  formatFcfaPrice,
  type BillingDuration,
} from '@/lib/pricing/config';
import { planOf, type Plan, type PlanId } from '@/lib/plans';

/**
 * Pastille de formule.
 */
export function PlanBadge({ plan, className }: { plan: PlanId | string | null; className?: string }) {
  const spec = planOf(plan);

  if (spec.id === 'free') {
    return (
      <Badge tone="neutral" className={className}>
        Gratuit
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
 * Carte d'une formule tarifaire complète, alignée sur la grille officielle.
 */
export function PlanCard({
  plan,
  duration = '1m',
  current = false,
  pending = false,
  onSelect,
  disabledReason,
  ctaLabel,
}: {
  plan: Plan;
  duration?: BillingDuration;
  /** Formule actuellement active sur le compte. */
  current?: boolean;
  pending?: boolean;
  /** Absent = carte informative (page publique), sans bouton d'action. */
  onSelect?: () => void;
  /** Renseigné = bouton désactivé, avec l'explication affichée dessous. */
  disabledReason?: string;
  ctaLabel?: string;
}) {
  const pricingConfig = PRICING_PLANS[plan.id];
  const periodPricing = getPlanPeriodPrice(plan.id, duration);
  const isFeatured = pricingConfig.highlight ?? false;
  const isPaid = plan.priceFcfa > 0;

  return (
    <div
      className={cn(
        'relative flex flex-col justify-between rounded-xl border bg-white p-6 transition-all duration-200',
        isFeatured
          ? 'border-purple/30 ring-2 ring-purple/20 shadow-lg md:-translate-y-1'
          : 'border-gray-200 shadow-sm hover:shadow-md',
      )}
    >
      {/* Badge de mise en avant */}
      {isFeatured && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-pill bg-brand-gradient px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
          <Sparkles className="size-3" aria-hidden />
          {pricingConfig.highlightLabel || 'Offre recommandée'}
        </span>
      )}

      <div>
        {/* En-tête */}
        <header>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[21px] font-bold text-ink">{pricingConfig.name}</h3>
            {current && <Badge tone="published">Active</Badge>}
          </div>
          <p className="mt-1.5 min-h-[38px] text-[13px] leading-relaxed text-gray-500">
            {pricingConfig.tagline}
          </p>
        </header>

        {/* Bloc Tarif */}
        <div className="mt-5 border-y border-gray-100 py-4">
          {!isPaid ? (
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-[32px] font-extrabold tracking-tight text-ink">0 FCFA</span>
              </div>
              <p className="mt-1 text-[12px] font-medium text-gray-500">
                25 exports filigranés inclus à vie
              </p>
            </div>
          ) : (
            <div>
              {/* Prix équivalent par mois */}
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-[32px] font-extrabold tracking-tight text-ink">
                  {formatFcfaPrice(periodPricing.monthlyEquivalentFcfa)}
                </span>
                <span className="text-[13px] font-medium text-gray-500">/ mois</span>

                {periodPricing.savingsLabel && (
                  <span className="ml-1 rounded-pill bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 border border-green-200/60">
                    {periodPricing.savingsLabel}
                  </span>
                )}
              </div>

              {/* Total prépayé et prix barré si engagement 6m ou 12m */}
              {duration !== '1m' && periodPricing.strikethroughTotalFcfa && (
                <div className="mt-1 flex items-center gap-2 text-[12px] text-gray-500">
                  <span>Facturé {formatFcfaPrice(periodPricing.totalFcfa)}</span>
                  <span className="text-gray-400 line-through">
                    {formatFcfaPrice(periodPricing.strikethroughTotalFcfa)}
                  </span>
                </div>
              )}

              {/* Argument massue : coût unitaire par participant */}
              {pricingConfig.costPerParticipantLabel && (
                <div className="mt-2.5 inline-block rounded-md bg-purple/5 px-2.5 py-1 text-[12px] font-medium text-purple">
                  {pricingConfig.costPerParticipantLabel}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Liste des fonctionnalités incluses */}
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
            Ce qui est inclus
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {pricingConfig.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-[13px] leading-snug text-gray-700">
                <Check className="mt-0.5 size-4 shrink-0 text-purple" strokeWidth={2.25} aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Action CTA */}
      <div className="mt-8 pt-4 border-t border-gray-100">
        {onSelect && (
          <div>
            <Button
              variant={isFeatured ? 'primary' : 'ghost'}
              className="w-full h-11 text-[14px] font-medium"
              disabled={current || pending || Boolean(disabledReason)}
              onClick={onSelect}
            >
              {current
                ? 'Formule actuellement active'
                : pending
                  ? 'Connexion sécurisée pawaPay…'
                  : (ctaLabel ?? (isPaid ? 'Payer par Mobile Money' : 'Commencer en Gratuit'))}
            </Button>
            {disabledReason && (
              <p className="mt-2 text-center text-[12px] leading-snug text-gray-500">
                {disabledReason}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
