'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DismissibleNotice, InlineError } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { PaymentReassurance } from '@/components/plans/plan-card';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import type { PlanId } from '@/lib/plans';
import {
  PRICING_PERIODS,
  PRICING_PLANS,
  PREPAYMENT_REASSURANCE,
  getPlanPeriodPrice,
  formatFcfaPrice,
  type BillingDuration,
} from '@/lib/pricing/config';
import { cn } from '@/lib/cn';
import { Smartphone } from 'lucide-react';

/**
 * État partagé de la page tarifs — la seule partie qui a besoin du navigateur.
 *
 * Les trois cartes sont rendues au serveur (voir `pricing-plans.tsx`). Ce
 * fichier fournit les **deux points interactifs** :
 *
 *   1. `PricingDurationSelector` — le choix 1 / 6 / 12 mois, qui met à jour les
 *      prix déjà présents dans le HTML ;
 *   2. `PlanCardAction` — un bouton par carte (paiement Mobile Money).
 *
 * Les deux communiquent par un contexte React, parce qu'ils sont rendus à deux
 * endroits différents de l'arbre (sélecteur au-dessus, boutons dans les cartes).
 */

interface PricingState {
  duration: BillingDuration;
  setDuration: (d: BillingDuration) => void;
  pending: PlanId | null;
  activate: (plan: PlanId) => void;
  error: string | null;
  notice: string | null;
  dismissNotice: () => void;
  checkingPayment: boolean;
  currentPlan: string | null | undefined;
}

const PricingContext = createContext<PricingState | null>(null);

function usePricing(): PricingState {
  const ctx = useContext(PricingContext);
  if (!ctx) throw new Error('PricingProvider manquant');
  return ctx;
}

export function PricingProvider({
  children,
  onDurationChange,
}: {
  children: React.ReactNode;
  /** Appelé après un changement de période, pour resynchroniser les prix. */
  onDurationChange?: (d: BillingDuration) => void;
}) {
  const router = useRouter();
  const { user, refresh } = useSession();

  const [duration, setDurationRaw] = useState<BillingDuration>('1m');
  const [pending, setPending] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);

  /* --- Vérification au retour de la page de paiement Mobile Money (N4) --- *
   * L'URL est lue ici dans un effet plutôt que par `useSearchParams` : cette
   * dernière exige une frontière `<Suspense>` et forcerait tout le contenu des
   * formules à sortir du rendu serveur — ce que la phase U1 vise précisément à
   * éviter. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const depositId = new URLSearchParams(window.location.search).get('depositId');
    if (!depositId) return;

    let isMounted = true;
    setCheckingPayment(true);

    /**
     * Date d'échéance du compte, relue **après** la confirmation.
     *
     * `refresh()` met à jour l'état React, mais l'effet qui héberge cette
     * fermeture a capturé l'ancien `user` : lire `user.plan_expires_at` ici
     * renverrait la valeur d'avant le paiement. On relit donc le profil
     * directement, ce qui est de toute façon ce que fait `refresh()` en
     * interne — sans dépendre du temps de rendu de React.
     */
    const readFreshPlanExpiry = async (): Promise<string | null> => {
      const fresh = await backend.getSessionUser();
      const iso = fresh?.plan_expires_at;
      if (!iso || fresh?.plan === 'free') return null;

      const expiry = new Date(iso);
      if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) return null;

      return new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Ouagadougou',
      }).format(expiry);
    };

    async function verifyDeposit() {
      try {
        const res = await fetch(
          `/api/payments/pawapay/check?depositId=${encodeURIComponent(depositId!)}`,
        );
        const data = await res.json();
        if (!isMounted) return;

        if (data.status === 'completed') {
          await refresh();
          const activatedPlan =
            data.plan === 'organization' ? 'Organisations & ONG' : 'Créateur';

          /*
           * La date d'échéance est relue **après** `refresh()`, donc depuis la
           * session à jour : `refresh()` recharge l'utilisateur, `plan_expires_at`
           * vient d'être écrit par le webhook. Sans elle, l'écran annonçait une
           * formule sans dire jusqu'à quand — le client ne pouvait pas savoir
           * s'il devait renouveler ou attendre.
           *
           * Elle peut rester absente si le webhook vient de passer et que le
           * `expires_at` n'est pas encore visible : dans ce cas on n'invente
           * rien, on confirme l'activation et laisse le client la retrouver dans
           * ses réglages.
           */
          const expiry = await readFreshPlanExpiry();

          setNotice(
            `Votre paiement Mobile Money a été validé. Votre formule ${activatedPlan} est maintenant active` +
              `${expiry ? ` jusqu’au ${expiry}` : ''}.`,
          );
          window.history.replaceState({}, '', '/tarifs');
        } else if (data.status === 'failed') {
          setError(
            data.failureMessage
              ? `Le paiement a échoué : ${data.failureMessage}`
              : 'Le paiement Mobile Money a été refusé ou annulé. Vous pouvez réessayer.',
          );
          window.history.replaceState({}, '', '/tarifs');
        } else if (data.error) {
          /*
           * La confirmation a été refusée alors que pawaPay dit `COMPLETED` —
           * le plus souvent un montant encaissé différent du montant attendu.
           * On ne dit pas « en cours » : le paiement ne se confirmera pas tout
           * seul, et laisser croire à une attente invite à réessayer en boucle.
           */
          setError(
            'Votre paiement a bien été reçu, mais nous ne pouvons pas le valider pour le moment. ' +
              'Notre équipe vérifie et vous répond sous 24 h. Aucune formule n’a été activée.',
          );
          window.history.replaceState({}, '', '/tarifs');
        } else {
          setNotice('Paiement Mobile Money en cours de confirmation par votre opérateur…');
        }
      } catch (err) {
        console.error('[Vérification du paiement]', err);
      } finally {
        if (isMounted) setCheckingPayment(false);
      }
    }

    void verifyDeposit();
    return () => {
      isMounted = false;
    };
  }, [refresh]);

  function setDuration(d: BillingDuration) {
    setDurationRaw(d);
    onDurationChange?.(d);
  }

  function activate(plan: PlanId) {
    setError(null);
    setPending(plan);

    const checkoutPath = plan === 'free'
      ? '/dashboard'
      : `/dashboard/acheter?plan=${encodeURIComponent(plan)}&duration=${encodeURIComponent(duration)}`;
    const destination = user?.onboarded_at
      ? checkoutPath
      : `/onboarding?next=${encodeURIComponent(checkoutPath)}`;

    /*
     * La page Tarifs ne déclenche plus de paiement. Elle qualifie l'intention,
     * puis l'espace compte affiche le récapitulatif et devient l'unique endroit
     * qui peut ouvrir la page Mobile Money.
     */
    if (!user) {
      router.push(`/signup?next=${encodeURIComponent(destination)}`);
    } else {
      router.push(destination);
    }
  }

  const value: PricingState = {
    duration,
    setDuration,
    pending,
    activate,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    checkingPayment,
    currentPlan: user?.plan,
  };

  return <PricingContext.Provider value={value}>{children}</PricingContext.Provider>;
}

/**
 * Sélecteur 1 / 6 / 12 mois.
 *
 * Rôle `radiogroup` : les trois positions sont **exclusives**, donc une radio,
 * pas trois boutons indépendants. Le libellé du groupe est lu par les lecteurs
 * d'écran, et les flèches gauche/droite font que l'ensemble est utilisable au
 * clavier comme au pouce.
 *
 * Cible tactile : chaque position dépasse 44 px de haut (padding vertical de
 * `py-3` + hauteur de ligne), condition sur un écran d'entrée de gamme.
 */
export function PricingDurationSelector() {
  const { duration, setDuration } = usePricing();

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const index = PRICING_PERIODS.findIndex((p) => p.id === duration);
    let next = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % PRICING_PERIODS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (index - 1 + PRICING_PERIODS.length) % PRICING_PERIODS.length;
    else return;
    e.preventDefault();
    setDuration(PRICING_PERIODS[next].id);
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        role="radiogroup"
        aria-label="Durée de l’abonnement"
        onKeyDown={onKeyDown}
        className="flex w-full items-center gap-1 rounded-pill border border-gray-200 bg-gray-50/80 p-1 shadow-sm sm:w-auto sm:inline-flex"
      >
        {PRICING_PERIODS.map((p) => {
          const isSelected = duration === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setDuration(p.id)}
              className={cn(
                'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-pill px-3 py-3 text-[13px] font-medium transition-all sm:flex-none sm:px-4',
                isSelected
                  ? 'bg-white font-semibold text-ink shadow-sm ring-1 ring-black/5'
                  : 'text-gray-500 hover:text-ink',
              )}
            >
              <span>{p.label}</span>
              {p.badge && (
                <span
                  className={cn(
                    'rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    isSelected ? 'bg-purple/10 text-purple' : 'bg-green-100/70 text-green-700',
                  )}
                >
                  {p.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-center text-[12px] leading-snug text-gray-500">
        {PREPAYMENT_REASSURANCE.lead} {PREPAYMENT_REASSURANCE.renewal}
      </p>
    </div>
  );
}

/** Messages d'état : erreur, notice, vérification de paiement en cours. */
export function PricingNotices() {
  const { error, notice, dismissNotice, checkingPayment } = usePricing();

  return (
    <div className="flex flex-col gap-4">
      <InlineError>{error}</InlineError>
      {notice && <DismissibleNotice onDismiss={dismissNotice}>{notice}</DismissibleNotice>}
      {checkingPayment && (
        <div className="flex items-center gap-2 rounded-lg border border-purple/30 bg-purple/5 p-4 text-[13px] font-medium text-purple">
          <Smartphone className="size-4 animate-pulse" />
          Vérification de votre paiement Mobile Money en cours…
        </div>
      )}
    </div>
  );
}

/**
 * Bouton d'action d'une carte de formule.
 *
 * Le libellé vient de la config (`ctaText`) : « Payer avec Mobile Money » n'est
 * pas une formulation libre, c'est un engagement — pas de carte bancaire, pas de
 * reconduction automatique. Le seul écart est celui de l'état du compte
 * (déjà actif, ou pas encore connecté), parce que le bouton ne peut pas faire
 * la même chose dans les trois cas.
 */
export function PlanCardAction({ planId, featured = false }: { planId: PlanId; featured?: boolean }) {
  const { pending, activate, currentPlan } = usePricing();
  const spec = PRICING_PLANS[planId];

  const isCurrent = currentPlan === planId;
  const isPaid = planId !== 'free';

  /*
   * Visiteur non connecté : on ne peut pas encaisser. Le libellé suit donc ce que
   * le bouton fait réellement.
   *
   * - Gratuit : « Commencer gratuitement » reste vrai, puisque le bouton mène à
   *   la création de compte, elle aussi gratuite.
   * - Offres payantes : « Créer un compte », et non « Payer avec Mobile Money ».
   *   Un bouton qui promet un paiement avant d'avoir la commande à laquelle le
   *   rattacher serait un bouton qui ment.
   */
  const label = !currentPlan
    ? isPaid
      ? 'Créer un compte'
      : spec.ctaText
    : isCurrent
      ? 'Formule actuellement active'
      : isPaid
        ? spec.ctaText
        : 'Passer en Gratuit';

  return (
    <div>
      <Button
        variant={featured ? 'primary' : 'ghost'}
        className="h-11 w-full text-[14px] font-medium"
        disabled={isCurrent || pending === planId}
        onClick={() => activate(planId)}
      >
        {pending === planId ? 'Connexion sécurisée…' : label}
      </Button>
      {isPaid && <PaymentReassurance />}
    </div>
  );
}

/**
 * Repercute la période choisie sur les prix **déjà rendus au serveur**.
 *
 * On ne re-rend pas les cartes : on corrige le texte et la visibilité des nœuds
 * porteurs d'attributs `data-price-*` (voir `plan-card.tsx`). C'est ce qui permet
 * de garder tout le contenu des formules dans le HTML servi — donc un premier
 * rendu complet, sans « Chargement des formules… » — tout en offrant un
 * sélecteur de durée instantané.
 *
 * Le premier rendu affiche 1 mois ; le sélecteur ne fait qu'écrire par-dessus.
 */
export function PricingPriceSync() {
  const { duration } = usePricing();

  useEffect(() => {
    for (const planId of ['creator', 'organization'] as const) {
      const period = getPlanPeriodPrice(planId, duration);
      const multi = duration !== '1m';

      const set = (attr: string, text: string | null) => {
        const node = document.querySelector<HTMLElement>(`[data-price-${attr}="${planId}"]`);
        if (!node) return;
        node.textContent = text ?? '';
        // Masqué plutôt que vide : sans cela, un nœud vide garde sa hauteur et
        // la carte se décale quand on change de période.
        node.classList.toggle('hidden', text === null);
      };

      /*
       * « / mois » n'est vrai qu'à un mois d'engagement. Au-delà, le grand
       * nombre est le total prépayé : garder « / mois » afficherait « 15 000 FCFA
       * / mois » pour une formule à 2 500 FCFA par mois. L'utilisateur ne se
       * trompera pas sur un détail — il renoncera à l'achat.
       */
      const unit = document.querySelector<HTMLElement>(`[data-price-unit="${planId}"]`);
      if (unit) unit.classList.toggle('hidden', multi);

      set('total', formatFcfaPrice(period.totalFcfa));
      set('strikethrough', period.strikethroughTotalFcfa ? formatFcfaPrice(period.strikethroughTotalFcfa) : null);
      set('savings', period.savingsLabel ?? null);
      set('monthly', multi ? `soit ${formatFcfaPrice(period.monthlyEquivalentFcfa)} / mois` : null);
    }
  }, [duration]);

  return null;
}
