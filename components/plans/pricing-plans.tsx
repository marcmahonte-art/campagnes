import { PlanCard } from '@/components/plans/plan-card';
import {
  PlanCardAction,
  PricingDurationSelector,
  PricingNotices,
  PricingPriceSync,
  PricingProvider,
} from '@/components/plans/pricing-controls';
import { PLAN_LIST } from '@/lib/plans';

/**
 * Les trois formules — **rendues au serveur**.
 *
 * Avant, ce bloc était un unique composant client derrière un `<Suspense>` : le
 * premier octet ne contenait que « Chargement des formules… », et les prix
 * n'apparaissaient qu'après hydratation. C'était un écran vide pour qui a une
 * connexion lente, et rien du tout pour un robot.
 *
 * Désormais, tout le contenu — les trois cartes (nom, prix, fonctions, mention
 * de paiement), le sélecteur de période et les boutons — est dans le HTML
 * servi. Le client n'ajoute que le comportement : changer de période, payer.
 *
 * Pas de `<Suspense>` : la vérification du retour de paiement lit l'URL dans un
 * effet, pas via `useSearchParams`. Rien n'est donc suspendu, et il n'existe
 * aucun état « chargement » à afficher.
 */
export function PricingPlans() {
  return (
    <PricingProvider>
      {/* Remet les prix d'aplomb si l'utilisateur change de période. */}
      <PricingPriceSync />

      <div className="flex flex-col gap-8">
        <PricingNotices />
        <PricingDurationSelector />

        <div className="grid items-stretch gap-6 md:grid-cols-3">
          {PLAN_LIST.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              duration="1m"
              action={
                <PlanCardAction
                  planId={plan.id}
                  featured={plan.id === 'organization'}
                />
              }
            />
          ))}
        </div>
      </div>
    </PricingProvider>
  );
}
