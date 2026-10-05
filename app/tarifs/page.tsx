import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Coins,
  ShieldCheck,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { SiteHeaderStatic } from '@/components/site-header-static';
import { SiteFooter } from '@/components/site-footer';
import { ComparisonTable } from '@/components/plans/comparison-table';
import { PricingPlans } from '@/components/plans/pricing-plans';
import {
  DISTRIBUTION_BANNER,
  DISTRIBUTION_PACKS,
  ENTERPRISE_CONTACT,
  PARTICIPANT_PAYMENT,
  PAYMENT_METHOD_LABELS,
  PREPAYMENT_REASSURANCE,
  PRICING_PLANS,
  formatFcfaPrice,
  formatUnitPrice,
} from '@/lib/pricing/config';
import { PLANS, PREMIUM_MODULES } from '@/lib/plans';

/**
 * Description de la page — **composée depuis la config**, jamais recopiée.
 *
 * Les prix changent plus d'une fois par an. Un montant écrit dans une chaîne
 * `metadata` survit à la config et devient le premier endroit du dépôt à
 * afficher un prix périmé (N3, N9).
 */
export const metadata: Metadata = {
  title: 'Tarifs et Abonnements — Campagnes',
  description:
    'Trois formules claires : Gratuit, Créateur ' +
    `${formatFcfaPrice(PRICING_PLANS.creator.monthlyPriceFcfa)},` +
    ` Organisations & ONG ${formatFcfaPrice(PRICING_PLANS.organization.monthlyPriceFcfa)}. ` +
    `Paiement par Mobile Money (${PAYMENT_METHOD_LABELS.operators.join(', ')}), sans carte bancaire.`,
};

/**
 * Page tarifs — rendue au serveur, sans un seul montant dans le JSX.
 *
 * Tout ce qui est affiché vient de `lib/pricing/config.ts`. Aucun composant
 * client n'entoure les prix : le HTML servi contient déjà les trois cartes, les
 * quotas et les coûts par participant. Le seul JavaScript de la page est le
 * sélecteur de durée et les boutons de paiement.
 */
export default function TarifsPage() {
  const enterpriseHref = `mailto:${ENTERPRISE_CONTACT.email}?subject=${encodeURIComponent(ENTERPRISE_CONTACT.subject)}&body=${encodeURIComponent(ENTERPRISE_CONTACT.body)}`;

  return (
    <>
      <SiteHeaderStatic />

      {/* ---------------- En-tête ---------------- */}
      <section className="border-b border-gray-200 bg-gray-50/70">
        <div className="container-shell mx-auto max-w-4xl py-14 text-center md:py-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-purple">
            Tarifs clairs et transparents
          </p>
          <h1 className="mt-3 text-[30px] font-extrabold leading-tight text-ink md:text-[44px]">
            L’abonnement paie les outils. La distribution se paie à l’usage.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-gray-600 md:text-[17px]">
            Créer une campagne est toujours gratuit. Vous ne payez que le volume réel que vous
            touchez : partager un lien ne coûte rien tant que personne ne participe.
          </p>
        </div>
      </section>

      {/* ---------------- Les trois formules ---------------- */}
      <section className="container-shell py-12 md:py-16">
        <PricingPlans />
      </section>

      {/* ---------------- Distribution : bandeau compact, pas des cartes -------- */}
      {/*
        Les cinq paliers ne deviennent pas des cartes ici : affichés à côté de
        l'offre ONG, ils se font cannibaliser (l'abonnement ONG revient moins cher
        à l'unité que le pack de taille équivalente — grille §7). L'achat se fait
        dans le tunnel, une fois une campagne choisie.
      */}
      <section className="border-y border-gray-200 bg-gray-50/70">
        <div className="container-shell py-14 md:py-18">
          <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
            <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              <Coins className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
              Distribution
            </p>
            <h2 className="mt-3 text-[24px] font-bold leading-tight text-ink md:text-[30px]">
              {DISTRIBUTION_BANNER.title}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              {DISTRIBUTION_BANNER.body}
            </p>
            <p className="mt-4 rounded-xl bg-purple/5 px-4 py-3 text-[13px] leading-relaxed text-gray-700">
              {DISTRIBUTION_BANNER.rule}
            </p>

            {/* Grille repliée par défaut : elle existe, mais elle ne vole pas la
                page aux formules d'abonnement. */}
            <details className="group mt-6">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center text-[13px] font-semibold text-purple">
                {DISTRIBUTION_BANNER.gridLabel}
              </summary>
              {/*overflow-hidden : le tableau apparaît en déroulant, sans saut. */}
              <div className="overflow-hidden">
                {/*
                  Tableau plutôt qu'une liste : volume, prix et coût unitaire sont
                  des nombres à comparer en colonne, et un tableau le dit au lecteur
                  — un lecteur d'écran annonçant trois listes perd cette
                  comparaison.

                  En dessous de 640 px, trois colonnes ne tiennent pas : on
                  resserre la gouttière et on interdit les coupures dans les
                  montants. Un « 2 500 / FCFA » coupé en deux lignes se lit
                  2 500 000, et sur un devis de distribution l'erreur se paie.
                */}
                <table className="mt-4 w-full text-left text-[12px] sm:text-[13px]">
                  <caption className="sr-only">Grille des crédits de distribution</caption>
                  <thead>
                    <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                      <th scope="col" className="py-2 pr-2 sm:pr-4">Volume</th>
                      <th scope="col" className="py-2 pr-2 sm:pr-4">Prix</th>
                      <th scope="col" className="py-2">Par pers.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DISTRIBUTION_PACKS.map((pack) => (
                      <tr key={pack.id} className="border-b border-gray-100 last:border-b-0">
                        <th
                          scope="row"
                          className="py-2.5 pr-2 font-medium text-gray-900 sm:pr-4"
                        >
                          {pack.name}
                        </th>
                        <td className="whitespace-nowrap py-2.5 pr-2 tabular-nums text-gray-700 sm:pr-4">
                          {pack.priceFcfa === null ? 'Sur devis' : formatFcfaPrice(pack.priceFcfa)}
                        </td>
                        <td className="whitespace-nowrap py-2.5 tabular-nums text-gray-500">
                          {pack.unitPriceFcfa === null
                            ? '—'
                            : `${formatUnitPrice(pack.unitPriceFcfa)} FCFA`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[12px] leading-snug text-gray-500">
                  {DISTRIBUTION_BANNER.unit}
                </p>
              </div>
            </details>

            {/* L'achat se fait dans le tableau de bord, sur une campagne. */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* `whitespace-nowrap` : sans lui, « Acheter des crédits » se coupe en deux
                  lignes dans la colonne étroite — un CTA qui se lit mal est un CTA
                  qu'on ne suit pas. */}
              <a
                href="/dashboard"
                className="bg-brand-gradient inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-pill px-6 text-[14px] font-medium text-white shadow-sm transition-shadow hover:shadow-md sm:w-auto"
              >
                {DISTRIBUTION_BANNER.ctaText}
                <ArrowRight className="size-4" aria-hidden />
              </a>
              <p className="text-[12px] leading-snug text-gray-500">
                Depuis une de vos campagnes · {PAYMENT_METHOD_LABELS.underCta}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Comparaison détaillée ---------------- */}
      <section className="container-shell py-14 md:py-18">
        <header className="max-w-2xl">
          <h2 className="text-[26px] font-bold leading-tight text-ink md:text-[34px]">
            Ce que contient chaque formule.
          </h2>
          <p className="mt-3 text-[15px] text-gray-500">
            Seules les fonctions disponibles aujourd’hui sont listées. Ce qui n’est pas encore
            construit n’est pas annoncé.
          </p>
        </header>

        <div className="mt-8">
          <ComparisonTable />
        </div>
      </section>

      {/* ---------------- Modules premium ---------------- */}
      <section className="border-y border-gray-200 bg-gray-50/70">
        <div className="container-shell py-14 md:py-18">
          <header className="max-w-2xl">
            <h2 className="text-[26px] font-bold leading-tight text-ink md:text-[34px]">
              Les modules premium, un par un.
            </h2>
            <p className="mt-3 text-[15px] text-gray-500">
              Chaque module s’active selon votre formule. Vous les voyez dans le produit, même
              verrouillés.
            </p>
          </header>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PREMIUM_MODULES.map((module) => {
              const from = PLANS[module.availableFrom];
              return (
                <div
                  key={module.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[15px] font-semibold text-ink">{module.name}</h3>
                    <span className="rounded-pill border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                      dès {from.name}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
                    {module.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- Quota épuisé : la dégradation douce ---------------- */}
      <section className="container-shell py-14 md:py-18">
        <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          <span className="rounded-pill bg-purple/10 px-2.5 py-0.5 text-[11px] font-semibold text-purple">
            Zéro blocage · Dégradation douce
          </span>
          <h2 className="mt-3 text-[22px] font-bold leading-tight text-ink">
            Que se passe-t-il si votre quota est épuisé ?
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <p className="flex items-start gap-2 text-[14px] leading-relaxed text-gray-600">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden />
              Votre campagne continue de fonctionner. Les visuels repartent avec le filigrane{' '}
              <span className="font-semibold text-ink">Campagnes</span>.
            </p>
            <p className="flex items-start gap-2 text-[14px] leading-relaxed text-gray-600">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden />
              Chaque participant peut retirer le filigrane pour{' '}
              <span className="font-semibold text-ink">{PARTICIPANT_PAYMENT.label}</span>, sans
              créer de compte.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Palier entreprise : sur devis, sans prix ---------------- */}
      {/*
        Pas de 4ᵉ carte. Les fonctions entreprise ne sont pas développées (N5) :
        les afficher avec un prix prometrait un produit inexistant. Elles se
        négocient, et c'est ce qui permet de retirer l'ancien 4ᵉ montant de la
        page sans perdre les prospects institutionnels.
      */}
      <section className="container-shell pb-14 md:pb-18">
        <div className="flex flex-col items-start gap-6 rounded-2xl border border-gray-200 bg-gray-50/60 p-6 md:flex-row md:items-center md:p-8">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-purple/10 text-purple">
            <Building2 className="size-6" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <div className="inline-flex rounded-pill bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">
              Grands comptes & institutions
            </div>
            <h2 className="mt-2 text-[21px] font-bold leading-snug text-ink md:text-[25px]">
              {ENTERPRISE_CONTACT.lead}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {ENTERPRISE_CONTACT.features.map((f) => (
                <li
                  key={f}
                  className="rounded-pill border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700"
                >
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2">
            <a
              href={enterpriseHref}
              className="bg-brand-gradient inline-flex h-11 shrink-0 items-center gap-2 rounded-pill px-6 text-[14px] font-medium text-white shadow-sm transition-shadow hover:shadow-md"
            >
              {ENTERPRISE_CONTACT.ctaText}
              <ArrowRight className="size-4" aria-hidden />
            </a>
            <span className="text-[12px] text-gray-500">{ENTERPRISE_CONTACT.responseDelay}</span>
          </div>
        </div>
      </section>

      {/* ---------------- Réassurance ---------------- */}
      {/*
        Formulation exacte, écrite une seule fois dans la config : la période
        facturée est un prépaiement, il n'y a ni reconduction automatique ni
        prélèvement récurrent (N12). Le texte doit dire ce qui se passe, pas
        « aucune surprise ».
      */}
      <section className="border-t border-gray-200 bg-gray-50/50">
        <div className="container-shell py-14">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-white text-purple shadow-xs">
              <ShieldCheck className="size-6" strokeWidth={1.75} aria-hidden />
            </span>
            <h2 className="mt-4 text-[21px] font-bold text-ink md:text-[24px]">
              {PREPAYMENT_REASSURANCE.lead}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-gray-500">
              {PREPAYMENT_REASSURANCE.body}
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-gray-500">
              {PREPAYMENT_REASSURANCE.renewal} {PAYMENT_METHOD_LABELS.reassurance}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="bg-brand-gradient inline-flex h-11 items-center rounded-pill px-6 text-[14px] font-medium text-white shadow-sm transition-shadow hover:shadow-md"
              >
                Créer un compte gratuit
              </Link>
              <Link
                href="/aide"
                className="inline-flex h-11 items-center rounded-pill border border-gray-300 bg-white px-6 text-[14px] font-medium text-gray-700 transition-colors hover:text-ink"
              >
                Poser une question
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
