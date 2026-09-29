'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DismissibleNotice, InlineError } from '@/components/ui/feedback';
import { PlanCard } from '@/components/plans/plan-card';
import { backend, canSelfActivatePlan } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { PLAN_LIST, planContactHref, planOf, type PlanId } from '@/lib/plans';

/**
 * Grille des formules.
 *
 * Sur la page publique, les cartes sont purement informatives. Une fois
 * connecté, elles deviennent actionnables.
 *
 * Deux régimes, selon `canSelfActivatePlan` :
 *   - mode démonstration — l'activation est un basculement direct, pour la recette ;
 *   - mode Supabase — aucune fonction d'auto-activation n'existe en base
 *     (migration 0005). Le bouton ouvre alors une demande de contact, ce qui est
 *     exactement le régime de la distribution : prix affichés, achat par contact.
 */
export function PricingPlans() {
  const router = useRouter();
  const { user, refresh } = useSession();

  const [pending, setPending] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function activate(plan: PlanId) {
    if (!user) {
      router.push('/signup');
      return;
    }

    // Une formule payante ne s'obtient pas depuis le navigateur tant qu'aucun
    // prestataire de paiement n'est branché : on ouvre une demande de contact.
    if (!canSelfActivatePlan && plan !== 'free') {
      window.location.href = planContactHref(planOf(plan));
      return;
    }

    setError(null);
    setPending(plan);

    const result = await backend.setPlan(user.id, plan);
    if (result.error) {
      setError(result.error);
      setPending(null);
      return;
    }

    await refresh();
    setPending(null);
    setNotice(
      plan === 'free'
        ? 'Votre compte est repassé en formule Free.'
        : `Formule ${plan === 'creator' ? 'Creator' : 'Organisation'} activée. Vos modules premium sont ouverts.`,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <InlineError>{error}</InlineError>
      {notice && <DismissibleNotice onDismiss={() => setNotice(null)}>{notice}</DismissibleNotice>}

      <div className="grid items-stretch gap-5 md:grid-cols-3">
        {PLAN_LIST.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={user?.plan === plan.id}
            pending={pending === plan.id}
            onSelect={() => void activate(plan.id)}
            ctaLabel={
              !user
                ? 'Créer un compte'
                : !canSelfActivatePlan && plan.id !== 'free'
                  ? 'Nous contacter'
                  : undefined
            }
          />
        ))}
      </div>

      <p className="text-[12px] leading-relaxed text-gray-500">
        {!user
          ? 'Créez un compte gratuit pour commencer. Vous pourrez monter en gamme quand vos campagnes le demanderont.'
          : canSelfActivatePlan
            ? 'Vous pouvez changer de formule à tout moment. Le changement est immédiat et sans engagement.'
            : "Les formules payantes s'activent par notre équipe : écrivez-nous et nous les ouvrons sous 24 h."}
      </p>
    </div>
  );
}
