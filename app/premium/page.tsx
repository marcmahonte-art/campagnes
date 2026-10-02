import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Download,
  Eye,
  Grid3x3,
  Image as ImageIcon,
  MousePointerClick,
  Share2,
  Sparkles,
} from 'lucide-react';
import { PremiumHeader } from '@/components/premium/premium-header';
import { PremiumFooter } from '@/components/premium/premium-footer';
import { PremiumCard } from '@/components/premium/premium-card';
import { PREMIUM_STEPS, SIAO, premiumCampaigns, readyCount } from '@/lib/premium';

/* ------------------------------------------------------------------ */
/* Métadonnées                                                         */
/* ------------------------------------------------------------------ */

export const metadata: Metadata = {
  title: 'SIAO 2026 × Campagnes — Participez au SIAO',
  description:
    'Choisissez votre campagne SIAO 2026, personnalisez votre visuel et partagez votre expérience.',
  alternates: { canonical: '/premium' },
  openGraph: {
    title: 'SIAO 2026 × Campagnes — Participez au SIAO',
    description:
      'Choisissez votre campagne SIAO 2026, personnalisez votre visuel et partagez votre expérience.',
    url: '/premium',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SIAO 2026 × Campagnes',
    description:
      'Choisissez votre campagne SIAO 2026, personnalisez votre visuel et partagez votre expérience.',
  },
};

/* ------------------------------------------------------------------ */
/* Icônes du parcours                                                  */
/* ------------------------------------------------------------------ */

const STEP_ICONS = {
  grid: Grid3x3,
  eye: Eye,
  mousePointer: MousePointerClick,
  image: ImageIcon,
  download: Download,
  share: Share2,
} as const;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/**
 * Page événementielle SIAO 2026.
 *
 * Elle ne ressemble pas à l'accueil, et c'est délibéré. L'accueil **explique un
 * produit** ; cette page **fait participer à un événement**. Le visiteur qui
 * scanne un QR code sur un stand n'a rien à comprendre : il doit voir le SIAO,
 * voir des modèles, en choisir un, mettre sa photo, repartir avec son visuel.
 *
 * La page ne détient aucune logique de campagne : tout vient de `lib/premium.ts`.
 * Elle ne détient aucun éditeur : « Utiliser ce template » mène au parcours
 * participant **existant** (`/c/:slug`), sans compte, exactement comme les
 * autres campagnes du produit. Il n'y a donc ni second éditeur, ni second
 * export, ni second système de partage — juste une vitrine différente au-dessus
 * de la même machinerie.
 *
 * Composant serveur : le HTML part complet, sans JavaScript de composition. Ce
 * qui compte, c'est que la page s'affiche vite sur un téléphone en 3G, depuis un
 * lien WhatsApp.
 */
export default function PremiumPage() {
  const campaigns = premiumCampaigns();
  const ready = readyCount(campaigns);

  return (
    <div className="min-h-dvh bg-white">
      <PremiumHeader />

      <main>
        {/* ================= HERO =================
            Un seul message, un seul CTA. Le hero ne vend rien : il situe
            l'événement et envoie vers la grille, qui est le vrai contenu. */}
        <section className="relative overflow-hidden border-b border-gray-200">
          {/* Halo de marque — décoratif, donc masqué aux lecteurs d'écran. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-32 size-[420px] rounded-full bg-brand-gradient opacity-[0.07] blur-3xl"
          />

          <div className="container-shell relative py-10 md:py-20">
            <span className="inline-flex items-center gap-2 rounded-pill border border-gray-200 px-3 py-1 text-[11px] font-medium text-gray-600">
              <Sparkles className="size-3 text-purple" aria-hidden />
              SIAO 2026 × Campagnes
            </span>

            {/* Sur mobile, tout est empilé et centré : le hero doit respirer
                entre le titre, le texte et le bouton. Les espacements sont donc
                plus larges en dessous de `md`, pas plus serrés. */}
            <div className="mt-5 grid gap-7 md:mt-6 md:grid-cols-[1.2fr_1fr] md:items-end md:gap-8">
              <div>
                <h1 className="text-[30px] font-bold leading-[1.1] tracking-tight md:text-[52px] md:leading-[1.08]">
                  Créez. Partagez.
                  <br />
                  <span className="text-brand-gradient">Faites participer.</span>
                </h1>

                <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-gray-500 md:mt-5 md:text-[16px]">
                  Des visuels officiels du SIAO 2026 pour faire rayonner votre expérience et
                  rassembler la communauté.
                </p>

                <a
                  href="#campagnes"
                  className="mt-6 inline-flex h-12 items-center gap-2 rounded-pill bg-brand-gradient px-6 text-[15px] font-medium text-white shadow-sm transition-all duration-200 ease-brand hover:shadow-md active:scale-[.985] md:mt-7"
                >
                  Choisir un modèle
                  <ArrowRight className="size-4" aria-hidden />
                </a>
              </div>

              {/* Encart d'identité de l'événement. Les dates et le lieu
                  n'apparaissent que s'ils sont renseignés dans `lib/premium.ts`
                  — on n'affiche jamais une date plausible. */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">
                  {SIAO.edition}
                </p>
                <p className="mt-1 text-[22px] font-bold leading-tight">{SIAO.name}</p>
                {(SIAO.dates || SIAO.city) && (
                  <p className="mt-2 text-[13px] text-gray-500">
                    {[SIAO.dates, SIAO.city].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="mt-4 flex flex-wrap gap-1.5">
                  {SIAO.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-pill border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600"
                    >
                      {tag}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ================= GALERIE ================= */}
        <section id="campagnes" className="container-shell scroll-mt-20 py-12 md:py-16">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="flex items-center gap-3 text-[24px] font-bold leading-tight md:text-[32px]">
                {/* Petit trait de marque, comme sur la maquette. */}
                <span aria-hidden className="h-1 w-8 rounded-pill bg-brand-gradient" />
                Choisissez votre campagne
              </h2>
              <p className="mt-2 text-[14px] text-gray-500 md:text-[15px]">
                Un modèle. Votre photo. Votre expérience.
              </p>
            </div>

            {/* Message honnête tant que les visuels ne sont pas livrés. */}
            {ready === 0 && (
              <p className="max-w-xs text-[13px] leading-relaxed text-gray-500">
                Les visuels officiels sont en cours de préparation sur cet environnement.
              </p>
            )}
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <PremiumCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </section>

        {/* ================= PARCOURS ================= */}
        <section className="border-t border-gray-200 bg-gray-50">
          <div className="container-shell py-12 md:py-16">
            <h2 className="flex items-center gap-3 text-[24px] font-bold leading-tight md:text-[32px]">
              <span aria-hidden className="h-1 w-8 rounded-pill bg-brand-gradient" />
              Votre parcours
            </h2>
            <p className="mt-2 text-[14px] text-gray-500 md:text-[15px]">
              Une expérience simple et rapide, de la découverte au partage.
            </p>

            {/*
              Six étapes. Sur mobile elles se suivent verticalement : une étape
              par ligne, lisible d'un pouce. Une rangée de six sur un écran de
              375 px donnerait des libellés tronqués — on ne comprime pas, on
              empile.
            */}
            <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-3">
              {PREMIUM_STEPS.map((step) => {
                const Icon = STEP_ICONS[step.icon];
                return (
                  <li
                    key={step.step}
                    className="flex gap-3 rounded-lg border border-gray-200 bg-white p-4 lg:flex-col lg:gap-2 lg:border-0 lg:bg-transparent lg:p-0"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-ink lg:border lg:border-gray-200">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-500">
                        {step.step}. {step.action}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
                        {step.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ================= REBOND DISCRET =================
            Un seul lien, en bas, après le parcours : le visiteur qui participe
            n'a pas à découvrir le produit ici. Celui qui organise, lui, doit
            pouvoir trouver comment créer sa propre campagne. */}
        <section className="container-shell py-10">
          <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-gray-200 p-6 md:flex-row md:items-center">
            <div>
              <p className="text-[15px] font-semibold">Vous organisez votre propre campagne ?</p>
              <p className="mt-1 text-[13px] text-gray-500">
                Créez votre cadre et partagez un lien comme celui-ci. C’est gratuit.
              </p>
            </div>
            <Link
              href="/signup"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-pill border border-gray-200 px-5 text-[13px] font-medium transition-colors hover:border-ink"
            >
              Créer ma campagne
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <PremiumFooter />
    </div>
  );
}
