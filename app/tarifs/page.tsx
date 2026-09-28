import type { Metadata } from 'next';
import { ArrowRight, Coins, ShieldCheck, Sparkles } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OfferCard } from '@/components/plans/offer-card';
import { ComparisonTable } from '@/components/plans/comparison-table';
import { PricingPlans } from '@/components/plans/pricing-plans';
import { DISTRIBUTION_CONTACT_EMAIL, DISTRIBUTION_OFFERS, quoteHref } from '@/lib/distribution';
import { PLANS, PREMIUM_MODULES } from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Tarifs',
  description:
    'Trois formules — Free, Creator, Organisation — et une distribution facturée à l’usage, sur devis.',
};

export default function TarifsPage() {
  return (
    <>
      <SiteHeader />

      {/* ---------------- En-tête ---------------- */}
      <section className="border-b border-gray-200 bg-gray-50">
        <div className="container-shell py-16 md:py-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            Tarifs
          </p>
          <h1 className="mt-3 max-w-3xl text-[32px] font-bold leading-tight md:text-[44px]">
            L’abonnement paie les outils. La distribution se paie à l’usage.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-gray-500">
            Créer une campagne est gratuit. Vous ne payez la diffusion que pour le volume que vous
            visez réellement : partager un lien à 10 000 personnes ne coûte rien tant que personne
            ne participe.
          </p>
        </div>
      </section>

      {/* ---------------- Les trois formules ---------------- */}
      <section className="container-shell py-16 md:py-20">
        <PricingPlans />
      </section>

      {/* ---------------- Distribution ---------------- */}
      <section className="border-y border-gray-200 bg-gray-50">
        <div className="container-shell py-16 md:py-20">
          <header className="max-w-2xl">
            <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              <Coins className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
              Distribution
            </p>
            <h2 className="mt-3 text-[28px] font-bold leading-tight md:text-[36px]">
              Vous payez le volume que vous visez.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-gray-500">
              Indiquez le nombre de participants attendu : nous établissons un devis à partir de la
              grille ci-dessous. Plus le volume est important, plus le prix par participant baisse.
            </p>
          </header>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {DISTRIBUTION_OFFERS.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>

          <Card className="mt-8 flex flex-col items-start gap-5 p-6 md:flex-row md:items-center">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-ink">
              <Sparkles className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold">Un volume qui ne figure pas dans la grille ?</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
                Écrivez-nous avec le contexte de votre campagne : nous adaptons les conditions.
                Réponse sous 48 heures ouvrées à{' '}
                <span className="font-medium text-gray-700">{DISTRIBUTION_CONTACT_EMAIL}</span>.
              </p>
            </div>
            <a
              href={quoteHref()}
              className="bg-brand-gradient inline-flex h-9 shrink-0 items-center gap-2 rounded-pill px-4 text-[13px] font-medium text-white shadow-sm transition-shadow hover:shadow-md"
            >
              Demander un devis
              <ArrowRight className="size-4" aria-hidden />
            </a>
          </Card>
        </div>
      </section>

      {/* ---------------- Comparaison ---------------- */}
      <section className="container-shell py-16 md:py-20">
        <header className="max-w-2xl">
          <h2 className="text-[28px] font-bold leading-tight md:text-[36px]">
            Ce que contient chaque formule.
          </h2>
          <p className="mt-3 text-base text-gray-500">
            Tout ce qui est coché est inclus dans l’abonnement, sans supplément.
          </p>
        </header>

        <div className="mt-10">
          <ComparisonTable />
        </div>
      </section>

      {/* ---------------- Modules premium ---------------- */}
      <section className="border-y border-gray-200 bg-gray-50">
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

      {/* ---------------- Pied de section ---------------- */}
      <section className="container-shell py-16 md:py-20">
        <Card className="flex flex-col items-start gap-5 p-8 md:flex-row md:items-center md:p-10">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-gray-50">
            <ShieldCheck className="size-5 text-ink" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="text-[22px] font-semibold leading-snug md:text-[26px]">
              Aucun engagement, aucune surprise.
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-gray-500">
              Vous pouvez revenir en formule Free à tout moment. Vos campagnes et vos cadres restent
              en place ; seuls les modules premium se referment.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <ButtonLink href="/signup" variant="primary">
              Commencer gratuitement
            </ButtonLink>
          </div>
        </Card>
      </section>
    </>
  );
}
