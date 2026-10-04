'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DismissibleNotice, InlineError } from '@/components/ui/feedback';
import { PlanCard } from '@/components/plans/plan-card';
import { backend, canSelfActivatePlan } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { PLAN_LIST, planContactHref, planOf, type PlanId } from '@/lib/plans';

function PricingPlansContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refresh } = useSession();

  const [pending, setPending] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);

  // Vérification automatique en retour de paiement pawaPay
  useEffect(() => {
    const depositId = searchParams.get('depositId');
    if (!depositId) return;

    let isMounted = true;
    setCheckingPayment(true);

    async function verifyDeposit() {
      try {
        const res = await fetch(`/api/payments/pawapay/check?depositId=${encodeURIComponent(depositId!)}`);
        const data = await res.json();

        if (!isMounted) return;

        if (data.status === 'completed') {
          await refresh();
          const activatedPlan = data.plan === 'organization' ? 'Organisation' : 'Creator';
          setNotice(`🎉 Félicitations ! Votre paiement Mobile Money a été validé avec succès. Votre formule ${activatedPlan} est désormais active.`);
          // Nettoie l'URL sans recharger
          window.history.replaceState({}, '', '/tarifs');
        } else if (data.status === 'failed') {
          setError(
            data.failureMessage
              ? `Le paiement a échoué : ${data.failureMessage}`
              : 'Le paiement Mobile Money a été refusé ou annulé. Vous pouvez réessayer.',
          );
          window.history.replaceState({}, '', '/tarifs');
        } else {
          setNotice('Paiement Mobile Money en cours de confirmation par votre opérateur...');
        }
      } catch (err) {
        console.error('[PawaPay Verification]', err);
      } finally {
        if (isMounted) setCheckingPayment(false);
      }
    }

    void verifyDeposit();

    return () => {
      isMounted = false;
    };
  }, [searchParams, refresh]);

  async function activate(plan: PlanId) {
    if (!user) {
      router.push('/signup');
      return;
    }

    setError(null);

    // Cas de la formule gratuite (downgrade)
    if (plan === 'free') {
      setPending('free');
      const result = await backend.setPlan(user.id, 'free');
      if (result.error) {
        setError(result.error);
        setPending(null);
        return;
      }
      await refresh();
      setPending(null);
      setNotice('Votre compte est repassé en formule Free.');
      return;
    }

    // Formule payante : initiation pawaPay
    setPending(plan);

    try {
      const response = await fetch('/api/payments/pawapay/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Si pawaPay n'est pas configuré
        if (data.code === 'PAWAPAY_NOT_CONFIGURED') {
          if (canSelfActivatePlan) {
            // Mode démonstration local : activation directe
            const result = await backend.setPlan(user.id, plan);
            if (result.error) {
              setError(result.error);
            } else {
              await refresh();
              setNotice(`[Mode Démo] Formule ${planOf(plan).name} activée sans passerelle.`);
            }
          } else {
            // Contact par email si passerelle inactive
            window.location.href = planContactHref(planOf(plan));
          }
          setPending(null);
          return;
        }

        setError(data.error || 'Erreur lors de l’initialisation du paiement pawaPay.');
        setPending(null);
        return;
      }

      // Redirection sécurisée vers la page de paiement Mobile Money
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error('Aucune URL de paiement fournie.');
      }
    } catch (err: unknown) {
      console.error('[PawaPay Client Error]', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de contacter le service de paiement. Veuillez réessayer.',
      );
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <InlineError>{error}</InlineError>
      {notice && <DismissibleNotice onDismiss={() => setNotice(null)}>{notice}</DismissibleNotice>}
      {checkingPayment && (
        <div className="rounded-lg border border-purple/20 bg-purple/5 p-4 text-[13px] text-purple">
          Vérification de votre paiement Mobile Money en cours...
        </div>
      )}

      <div className="grid items-stretch gap-5 md:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const isCurrent = user?.plan === plan.id;
          const isPaid = plan.id !== 'free';

          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              current={isCurrent}
              pending={pending === plan.id}
              onSelect={() => void activate(plan.id)}
              ctaLabel={
                !user
                  ? 'Créer un compte'
                  : isCurrent
                    ? 'Formule active'
                    : isPaid
                      ? 'Payer par Mobile Money'
                      : 'Passer en Free'
              }
            />
          );
        })}
      </div>

      <p className="text-[12px] leading-relaxed text-gray-500">
        {!user
          ? 'Créez un compte gratuit pour commencer. Vous pourrez monter en gamme à tout moment.'
          : 'Paiement direct et sécurisé via Mobile Money (Orange Money, MTN MoMo, Moov, Wave, Airtel, etc.). Activation instantanée dès validation sur votre téléphone.'}
      </p>
    </div>
  );
}

export function PricingPlans() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12 text-sm text-gray-500">
          Chargement des formules...
        </div>
      }
    >
      <PricingPlansContent />
    </Suspense>
  );
}
