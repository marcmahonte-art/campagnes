'use client';

import { Lock } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { PlanBadge } from '@/components/plans/plan-card';
import { PLANS, PREMIUM_MODULES, hasFeature, type PlanFeature } from '@/lib/plans';
import type { PlanId } from '@/lib/plans';

/**
 * Verrou d'un module premium.
 *
 * Principe : on ne cache jamais ce qui existe. Le module reste visible, avec sa
 * description et la formule qui le débloque — c'est ce qui donne envie de monter
 * en gamme, sans jamais bloquer un créateur Free dans son parcours de base.
 */
export function FeatureGate({
  feature,
  plan,
  title,
  description,
}: {
  feature: PlanFeature;
  /** Formule courante du compte. */
  plan: PlanId | string | null;
  /** Remplacent le libellé du catalogue si l'écran a son propre vocabulaire. */
  title?: string;
  description?: string;
}) {
  const module = PREMIUM_MODULES.find((m) => m.feature === feature);
  const required = module?.availableFrom ?? 'creator';
  const requiredPlan = PLANS[required];
  const unlocked = hasFeature(plan, feature);

  // Sécurité : si le module est débloqué, l'appelant s'est trompé d'endroit.
  if (unlocked) return null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-gray-50 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white text-gray-400">
          <Lock className="size-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold">{title ?? module?.name ?? 'Module premium'}</h3>
            <PlanBadge plan={required} />
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
            {description ?? module?.description ?? 'Ce module est réservé aux formules payantes.'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href="/settings#formule" variant="ghost" size="sm">
          Débloquer avec {requiredPlan.name}
        </ButtonLink>
        <span className="text-[12px] text-gray-500">
          {requiredPlan.priceFcfa === 0
            ? 'Gratuit'
            : `${new Intl.NumberFormat('fr-FR').format(requiredPlan.priceFcfa)} FCFA / mois`}{' '}
          ·{' '}
          <a href="/tarifs" className="underline underline-offset-4 hover:text-ink">
            comparer les formules
          </a>
        </span>
      </div>
    </div>
  );
}
