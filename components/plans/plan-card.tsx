import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import {
  PRICING_PLANS,
  PAYMENT_METHOD_LABELS,
  getPlanPeriodPrice,
  formatFcfaPrice,
  type BillingDuration,
} from '@/lib/pricing/config';
import type { Plan, PlanId } from '@/lib/plans';

export { PlanBadge } from '@/components/plans/plan-badge';

/**
 * Carte d'une formule tarifaire — **rendue au serveur**.
 *
 * Elle n'a aucun état : tout ce qu'elle affiche vient de `lib/pricing/config.ts`
 * et des propriétés reçues. Le bouton d'action, lui, est interactif et vit dans
 * `pricing-controls.tsx` ; il est injecté par le parent pour que le HTML de la
 * carte (nom, quota, prix, coût par participant, fonctions) existe **dès le
 * premier octet**, sans dépendre de l'hydratation (donc sans « Chargement des
 * formules… » et sans décalage de mise en page).
 *
 * `action` : un nœud déjà rendu (bouton client ou lien) — la carte ne décide
 * pas de ce qu'on peut faire, elle se contente de l'afficher.
 *
 * ## Comment le sélecteur de durée agit-il sur une carte déjà rendue ?
 *
 * Il ne re-rend rien : il **réécrit le texte des nœuds porteurs d'attributs
 * `data-price-*`** (voir `PricingPriceSync`). Le premier rendu affiche donc la
 * période par défaut — 1 mois — et les autres apparaissent sans latence.
 * Conséquence : le prix, l'équivalent mensuel, le prix barré et l'argument
 * « X mois offerts » doivent tous exister dans le HTML, y compris à 1 mois,
 * sinon le sélecteur n'aurait rien à corriger.
 */
export function PlanCard({
  plan,
  duration = '1m',
  current = false,
  action,
}: {
  plan: Plan;
  duration?: BillingDuration;
  /** Formule actuellement active sur le compte. */
  current?: boolean;
  /** Bouton d'action, rendu par le parent (client). Absent = carte informative. */
  action?: React.ReactNode;
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
      {/* Badge de mise en avant — une seule carte, jamais deux. */}
      {isFeatured && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-pill bg-brand-gradient px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
          <Sparkles className="size-3" aria-hidden />
          {pricingConfig.highlightLabel ?? 'Offre recommandée'}
        </span>
      )}

      <div>
        {/* 1. Nom de l'offre + public visé */}
        <header>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[21px] font-bold text-ink">{pricingConfig.name}</h3>
            {current && <Badge tone="published">Active</Badge>}
          </div>
          <p className="mt-1.5 min-h-[38px] text-[13px] leading-relaxed text-gray-500">
            {pricingConfig.tagline}
          </p>
        </header>

        {/* 2. Prix */}
        <div className="mt-5 border-y border-gray-100 py-4">
          <div className="flex items-baseline gap-2 flex-wrap">
            {/* Le total de la période. À 1 mois il vaut le prix mensuel ; à 6 ou
                12 mois c'est le prépaiement, et le prix barré apparaît à côté. */}
            <span
              data-price-total={plan.id}
              className="text-[32px] font-extrabold tracking-tight text-ink tabular-nums"
            >
              {formatFcfaPrice(periodPricing.totalFcfa)}
            </span>
            {/*
              « / mois » n'est vrai qu'à 1 mois. À 6 ou 12 mois le grand nombre
              est le **total prépayé** : écrire « 15 000 FCFA / mois » afficherait
              un prix mensuel cinq fois trop élevé, et c'est exactement le genre
              d'erreur qu'un acheteur ONG remarque. L'équivalent mensuel est
              donné plus bas, en petit, une fois la ligne lue.
            */}
            <span
              data-price-unit={plan.id}
              className={cn(
                'text-[13px] font-medium text-gray-500',
                (!isPaid || !!periodPricing.strikethroughTotalFcfa) && 'hidden',
              )}
            >
              / mois
            </span>

            {/* Prix barré : prorata simple (mensuel × mois), jamais un prix historique. */}
            <span
              data-price-strikethrough={plan.id}
              className={cn(
                'text-[13px] text-gray-400 line-through tabular-nums',
                !periodPricing.strikethroughTotalFcfa && 'hidden',
              )}
            >
              {periodPricing.strikethroughTotalFcfa
                ? formatFcfaPrice(periodPricing.strikethroughTotalFcfa)
                : ''}
            </span>
          </div>

          {/* Argument « X mois offerts ». Jamais un pourcentage : les acheteurs
              sont des ONG qui doivent justifier la dépense ligne à ligne. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              data-price-savings={plan.id}
              className={cn(
                'rounded-pill border border-green-200/60 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700',
                !periodPricing.savingsLabel && 'hidden',
              )}
            >
              {periodPricing.savingsLabel ?? ''}
            </span>
            {/* Équivalent par mois — visible dès que la période dépasse un mois. */}
            <span
              data-price-monthly={plan.id}
              className={cn(
                'text-[12px] text-gray-500 tabular-nums',
                !periodPricing.strikethroughTotalFcfa && 'hidden',
              )}
            >
              {periodPricing.strikethroughTotalFcfa
                ? `soit ${formatFcfaPrice(periodPricing.monthlyEquivalentFcfa)} / mois`
                : ''}
            </span>
          </div>

          {/* 3. Le quota : c'est ce que l'acheteur achète réellement. */}
          <p className="mt-3 flex items-start gap-1.5 text-[13px] font-medium text-ink">
            <Check className="mt-0.5 size-4 shrink-0 text-purple" strokeWidth={2.25} aria-hidden />
            <span>{pricingConfig.quotaLabel}</span>
          </p>

          {/* 4. Le coût par participant — l'argument le plus fort de la page.
              Il reste sous le prix, jamais relégué en bas de carte. */}
          {pricingConfig.costPerParticipantLabel && (
            <p className="mt-2 inline-block rounded-md bg-purple/5 px-2.5 py-1 text-[12px] font-semibold text-purple">
              {pricingConfig.costPerParticipantLabel}
            </p>
          )}
        </div>

        {/* 5. Fonctionnalités — uniquement ce qui est développé (N5). */}
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
            Ce qui est inclus
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {pricingConfig.features.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2.5 text-[13px] leading-snug text-gray-700"
              >
                <Check
                  className="mt-0.5 size-4 shrink-0 text-purple"
                  strokeWidth={2.25}
                  aria-hidden
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 6. CTA — injecté par le parent (client). */}
      {action && <div className="mt-8 border-t border-gray-100 pt-4">{action}</div>}
    </div>
  );
}

/**
 * Mention obligatoire sous chaque bouton payant (checklist d'acceptation) :
 * elle dit **comment** on paie et ce qu'on ne peut pas faire — pas de carte
 * bancaire, pas de prélèvement. Le texte vient de la config (N3), ce composant
 * n'a aucun état.
 */
export function PaymentReassurance() {
  return (
    <p className="mt-2 text-center text-[12px] leading-snug text-gray-500">
      {PAYMENT_METHOD_LABELS.underCta}
    </p>
  );
}

export type { PlanId };