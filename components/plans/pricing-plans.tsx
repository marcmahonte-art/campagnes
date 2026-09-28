'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DismissibleNotice, InlineError } from '@/components/ui/feedback';
import { PlanCard } from '@/components/plans/plan-card';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { PLAN_LIST, type PlanId } from '@/lib/plans';

/**
 * Grille des formules.
 *
 * Sur la page publique, les cartes sont purement informatives. Une fois
 * connecté, elles deviennent actionnables : l'activation est immédiate.
 *
 * NOTE — à ce stade aucun prestataire de paiement n'est branché : l'activation
 * est un basculement direct, destiné à la recette. En production, seul le
 * webhook de paiement (clé service_role) pourra activer une formule payante,
 * et le bouton redirigera vers le guichet du prestataire.
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
            ctaLabel={user ? undefined : 'Créer un compte'}
          />
        ))}
      </div>

      <p className="text-[12px] leading-relaxed text-gray-500">
        {user
          ? 'Vous pouvez changer de formule à tout moment. Le changement est immédiat et sans engagement.'
          : 'Créez un compte gratuit pour commencer. Vous pourrez monter en gamme quand vos campagnes le demanderont.'}
      </p>
    </div>
  );
}
