import type { Metadata } from 'next';
import { ArrowRight, Coins, ShieldCheck, Sparkles, Building2, HelpCircle, CheckCircle2 } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OfferCard } from '@/components/plans/offer-card';
import { ComparisonTable } from '@/components/plans/comparison-table';
import { PricingPlans } from '@/components/plans/pricing-plans';
import { DISTRIBUTION_OFFERS } from '@/lib/distribution';
import { PLANS, PREMIUM_MODULES } from '@/lib/plans';
import {
  ENTERPRISE_CONTACT,
  PARTICIPANT_PAYMENT,
} from '@/lib/pricing/config';

export const metadata: Metadata = {
  title: 'Tarifs et Abonnements — Campagnes',
  description:
    'Trois formules claires (Gratuit, Créateur, Organisations & ONG) et des packs de distribution à vie. Paiement direct et sécurisé par Mobile Money (Orange, MTN, Wave, Moov, Airtel).',
};

export default function TarifsPage() {
  const enterpriseHref = `mailto:${ENTERPRISE_CONTACT.email}?subject=${encodeURIComponent(ENTERPRISE_CONTACT.subject)}&body=${encodeURIComponent(ENTERPRISE_CONTACT.body)}`;

  return (
    <>
      <SiteHeader />

      {/* ---------------- En-tête ---------------- */}
      <section className="border-b border-gray-200 bg-gray-50/70">
        <div className="container-shell py-16 md:py-20 text-center max-w-4xl mx-auto">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-purple">
            Tarifs clairs et transparents
          </p>
          <h1 className="mt-3 text-[32px] font-extrabold leading-tight text-ink md:text-[46px]">
            L’abonnement paie les outils. La distribution se paie à l’usage.
          </h1>
          <p className="mt-5 text-base md:text-lg leading-relaxed text-gray-600 max-w-2xl mx-auto">
            Créer une campagne est toujours gratuit. Vous ne payez que le volume réel que vous touchez :
            partager un lien ne coûte rien tant que personne ne participe.
          </p>
        </div>
      </section>

      {/* ---------------- Les trois formules avec pawaPay ---------------- */}
      <section className="container-shell py-14 md:py-18">
        <PricingPlans />
      </section>

      {/* ---------------- Explication Quota vs Crédits ---------------- */}
      <section className="border-t border-gray-200 bg-white py-12">
        <div className="container-shell">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-6 md:p-8">
            <h2 className="text-[18px] font-bold text-ink flex items-center gap-2">
              <HelpCircle className="size-5 text-purple" />
              Comprendre la différence entre quota inclus et packs de distribution
            </h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs">
                <div className="inline-flex rounded-md bg-purple/10 px-2.5 py-1 text-[12px] font-semibold text-purple">
                  Quota inclus dans l’abonnement
                </div>
                <h3 className="mt-2.5 text-[15px] font-semibold text-ink">
                  Renouvelé chaque mois (non reportable)
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
                  Chaque formule payante inclut un quota mensuel (100 ou 1 000 participants). Ce quota est idéal pour les créateurs et ONG qui mènent des actions régulières à coût ultra-réduit (jusqu’à 5 FCFA par participant).
                </p>
                <div className="mt-4 flex items-center gap-2 text-[12px] font-medium text-gray-700">
                  <CheckCircle2 className="size-4 text-green-600" />
                  Prioritaire sur vos campagnes du mois en cours
                </div>
              </div>

              <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs">
                <div className="inline-flex rounded-md bg-green-50 px-2.5 py-1 text-[12px] font-semibold text-green-700 border border-green-200/60">
                  Packs de crédits achetés
                </div>
                <h3 className="mt-2.5 text-[15px] font-semibold text-ink">
                  Permanents et cumulables à vie (jamais perdus)
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
                  Besoin d’un renfort ponctuel ou d’un événement exceptionnel ? Les crédits achetés n’expirent jamais et se reportent automatiquement d’une campagne à l’autre, quel que soit votre plan.
                </p>
                <div className="mt-4 flex items-center gap-2 text-[12px] font-medium text-gray-700">
                  <CheckCircle2 className="size-4 text-green-600" />
                  Ne disparaissent jamais à la fin du mois
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Distribution — crédits de participation ---------------- */}
      <section className="border-y border-gray-200 bg-gray-50/70">
        <div className="container-shell py-16 md:py-20">
          <header className="max-w-2xl">
            <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              <Coins className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
              Packs de crédits de distribution
            </p>
            <h2 className="mt-3 text-[28px] font-bold leading-tight md:text-[36px]">
              Vous payez uniquement le volume que vous visez.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-gray-500">
              Une participation n’est décomptée qu’au téléchargement réussi du visuel par un participant. Le partage du lien, les clics et les essais sont 100 % gratuits.
            </p>
          </header>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {DISTRIBUTION_OFFERS.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>

          {/* Dégradation douce & Paywall participant */}
          <div className="mt-10 rounded-xl border border-gray-200 bg-white p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <span className="rounded-pill bg-purple/10 px-2.5 py-0.5 text-[11px] font-semibold text-purple">
                Zéro blocage · Dégradation douce
              </span>
              <h3 className="mt-2 text-[17px] font-bold text-ink">
                Que se passe-t-il si votre quota de campagne est épuisé ?
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
                Votre campagne ne s’arrête jamais brutalement. Si votre quota est atteint, les visuels continuent d’être générés avec le discret filigrane Campagnes. Chaque participant peut également choisir de retirer le filigrane instantanément pour <span className="font-semibold text-ink">{PARTICIPANT_PAYMENT.label}</span> via Mobile Money.
              </p>
            </div>

            <div className="shrink-0">
              <ButtonLink href="/tarifs" variant="secondary" className="text-[13px]">
                Recharger un pack
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Comparaison détaillée ---------------- */}
      <section className="container-shell py-16 md:py-20">
        <header className="max-w-2xl">
          <h2 className="text-[28px] font-bold leading-tight md:text-[36px]">
            Ce que contient chaque formule.
          </h2>
          <p className="mt-3 text-base text-gray-500">
            Toutes les fonctionnalités cochées sont garanties sans surcoût caché.
          </p>
        </header>

        <div className="mt-10">
          <ComparisonTable />
        </div>
      </section>

      {/* ---------------- Modules premium ---------------- */}
      <section className="border-y border-gray-200 bg-gray-50/70">
        <div className="container-shell py-16 md:py-20">
          <header className="max-w-2xl">
            <h2 className="text-[28px] font-bold leading-tight md:text-[36px]">
              Les modules premium, un par un.
            </h2>
            <p className="mt-3 text-base text-gray-500">
              Chaque module s’active selon votre formule. Vous les voyez dans le produit, même
              verrouillés.
            </p>
          </header>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PREMIUM_MODULES.map((module) => {
              const from = PLANS[module.availableFrom];
              return (
                <Card key={module.id} className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[15px] font-semibold">{module.name}</h3>
                    <span className="rounded-pill border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                      dès {from.name}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
                    {module.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- Palier Entreprise / Grands Comptes (Sur devis sans 4e carte) ---------------- */}
      <section className="container-shell py-16 md:py-20">
        <Card className="flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:p-10 border-gray-200">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-purple/10 text-purple">
            <Building2 className="size-6" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <div className="inline-flex rounded-pill bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">
              Grands comptes & Institutions
            </div>
            <h2 className="mt-2 text-[22px] font-bold leading-snug text-ink md:text-[26px]">
              Vous avez des besoins d’envergure ou un cahier des charges spécifique ?
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-gray-500">
              Déploiements au-delà de 10 000 participants, domaine personnalisé, galerie privée dédiée, intégrations SSO/API, rapport sponsor sur-mesure et facturation d’entreprise.
            </p>
          </div>
          <div className="flex shrink-0">
            <a
              href={enterpriseHref}
              className="bg-brand-gradient inline-flex h-11 shrink-0 items-center gap-2 rounded-pill px-6 text-[14px] font-medium text-white shadow-sm transition-shadow hover:shadow-md"
            >
              Demander un devis sur-mesure
              <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </Card>
      </section>

      {/* ---------------- Pied de section ---------------- */}
      <section className="border-t border-gray-200 bg-gray-50/50">
        <div className="container-shell py-14">
          <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
            <span className="flex size-11 items-center justify-center rounded-full bg-white shadow-xs text-purple">
              <ShieldCheck className="size-6" strokeWidth={1.75} aria-hidden />
            </span>
            <h2 className="mt-4 text-[22px] font-bold text-ink">
              Aucun engagement, aucune mauvaise surprise.
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-gray-500">
              Tous nos abonnements sont prépayés par Mobile Money sans prélèvement automatique forcé. Vous pouvez changer de formule ou revenir en formule Gratuite en un clic.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/signup" variant="primary" className="h-11 px-6 text-[14px]">
                Créer un compte gratuit
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
