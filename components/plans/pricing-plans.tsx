'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DismissibleNotice, InlineError } from '@/components/ui/feedback';
import { PlanCard } from '@/components/plans/plan-card';
import { backend, canSelfActivatePlan } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { PLAN_LIST, planContactHref, planOf, type PlanId } from '@/lib/plans';
import {
  PRICING_PERIODS,
  type BillingDuration,
  PRICING_PLANS,
} from '@/lib/pricing/config';
import { cn } from '@/lib/cn';
import { Shield, Smartphone } from 'lucide-react';

function PricingPlansContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refresh } = useSession();

  const [duration, setDuration] = useState<BillingDuration>('1m');
  const [pending, setPending] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);

  // Vérification automatique en retour de redirection pawaPay
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
          const activatedPlan = data.plan === 'organization' ? 'Organisations & ONG' : 'Créateur';
          setNotice(`🎉 Félicitations ! Votre paiement Mobile Money a été validé. Votre formule ${activatedPlan} est maintenant active.`);
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
      setNotice('Votre compte est repassé en formule Gratuite.');
      return;
    }

    // Formule payante : initiation sécurisée pawaPay
    setPending(plan);

    try {
      const response = await fetch('/api/payments/pawapay/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, duration }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Si les identifiants pawaPay ne sont pas encore configurés en production
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

      // Redirection vers la Hosted Payment Page pawaPay
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error('Aucune URL de redirection renvoyée par pawaPay.');
      }
    } catch (err: unknown) {
      console.error('[PawaPay Client Error]', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de contacter le service de paiement Mobile Money. Veuillez réessayer.',
      );
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <InlineError>{error}</InlineError>
      {notice && <DismissibleNotice onDismiss={() => setNotice(null)}>{notice}</DismissibleNotice>}
      {checkingPayment && (
        <div className="rounded-lg border border-purple/30 bg-purple/5 p-4 text-[13px] font-medium text-purple flex items-center gap-2">
          <Smartphone className="size-4 animate-pulse" />
          Vérification de votre paiement Mobile Money en cours...
        </div>
      )}

      {/* Sélecteur de période de prépaiement (1 mois / 6 mois / 1 an) */}
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="inline-flex items-center rounded-pill border border-gray-200 bg-gray-50/80 p-1 shadow-sm">
          {PRICING_PERIODS.map((p) => {
            const isSelected = duration === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setDuration(p.id)}
                className={cn(
                  'relative flex items-center gap-2 rounded-pill px-4 py-2 text-[13px] font-medium transition-all',
                  isSelected
                    ? 'bg-white text-ink shadow-sm ring-1 ring-black/5 font-semibold'
                    : 'text-gray-500 hover:text-ink',
                )}
              >
                <span>{p.label}</span>
                {p.badge && (
                  <span
                    className={cn(
                      'rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                      isSelected
                        ? 'bg-purple/10 text-purple'
                        : 'bg-green-100/70 text-green-700',
                    )}
                  >
                    {p.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-gray-500">
          Prépaiement direct sans reconduction automatique · Pas de mauvaise surprise.
        </p>
      </div>

      {/* Grille des 3 offres */}
      <div className="grid items-stretch gap-6 md:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const isCurrent = user?.plan === plan.id;
          const isPaid = plan.id !== 'free';

          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              duration={duration}
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
                      : 'Passer en Gratuit'
              }
            />
          );
        })}
      </div>

      {/* Bannière de réassurance Mobile Money & Sécurité */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-gray-600">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-xs text-purple">
            <Smartphone className="size-5" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-ink">
              Paiement Mobile Money instantané (UEMOA)
            </p>
            <p className="text-[12px] text-gray-500">
              Orange Money, MTN MoMo, Moov Money, Wave, Airtel Money via la passerelle sécurisée pawaPay.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[12px] font-medium text-gray-500 shrink-0">
          <Shield className="size-4 text-purple" />
          <span>Transactions chiffrées & certifiées</span>
        </div>
      </div>
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
