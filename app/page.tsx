import {
  ArrowRight,
  Play,
  Sparkles,
  ChevronRight,
  Image as ImageIcon,
  Video,
  Images,
  Flame,
} from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { TrendingCampaigns } from '@/components/gallery/trending-campaigns';
import { TrendingTemplates } from '@/components/gallery/trending-templates';
import { Logo } from '@/components/ui/logo';
import { ButtonLink } from '@/components/ui/button';

/* ──────────────────────────────────────────────────────────────────────────────
   Static data — mirroring what the design shows. These would normally come from
   the database once real campaigns exist.
   ────────────────────────────────────────────────────────────────────────────── */

const FEATURED = {
  title: 'SIAO 2026',
  subtitle: "Salon International de l'Artisanat de Ouagadougou",
  tags: ['Artisanat', 'Culture', 'Innovation'],
  creator: 'Ministère du Commerce',
  ratio: '9:16' as const,
};

/*
 * `TRENDING_CAMPAIGNS` a été retiré.
 *
 * C'était quatre campagnes écrites en dur, avec des compteurs inventés —
 * 12 400 likes, 3 200 utilisations — et un aperçu réduit au nom de la campagne
 * sur un fond gris. Aucun de ces chiffres ne mesurait quoi que ce soit, et ils
 * étaient visibles par tout visiteur sur la page d'accueil : c'est la seule
 * description de campagne de tout le projet qui ne venait pas de la base.
 *
 * La section lit désormais `TrendingCampaigns`, qui va chercher les campagnes
 * publiées et affiche le vrai visuel par le même composant que la galerie.
 */

const TRUST_LOGOS = [
  'Ministère du Commerce',
  'UNFPA',
  'World Food Programme',
  'Orange',
  'CANAL+',
  'Moov Africa',
  'Rotary',
  'Airtel',
];

const TEMPLATE_FILTERS = [
  { id: 'all', label: 'Tous', icon: null },
  { id: 'photo_frame', label: 'Photo Frame', icon: ImageIcon },
  { id: 'video_frame', label: 'Video Frame', icon: Video },
  { id: 'background_frame', label: 'Background Frame', icon: Images },
  { id: 'trending', label: 'En ce moment', icon: Flame },
];

/*
 * `SAMPLE_TEMPLATES` a été retiré pour la même raison que
 * `TRENDING_CAMPAIGNS` : cinq campagnes inventées, avec des compteurs qui
 * n'existaient pas et des aperçus réduits au nom sur fond gris. Les filtres
 * ci-dessus, eux, restent — ils décrivent les types réellement disponibles, et
 * la galerie sait les appliquer.
 */

/* ──────────────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <>
      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative overflow-hidden bg-ink">
        <SiteHeader transparent />

        {/* Decorative halos */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="halo absolute -left-32 -top-40 size-[420px] rounded-full" />
          <div className="halo absolute -right-24 top-24 size-[360px] rounded-full opacity-20" />
        </div>

        <div className="container-shell relative flex min-h-[86vh] flex-col items-center justify-center py-28 text-center">
          <Logo variant="white" size="xl" asLink={false} className="mb-6 drop-shadow-lg" />

          <h1 className="mt-10 max-w-3xl text-[34px] font-bold leading-[1.1] text-white md:text-[48px]">
            Créez des campagnes visuelles que votre communauté peut utiliser en quelques secondes.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
            Un cadre. Un lien. Aucune installation. Le participant n'a même pas besoin de compte.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <ButtonLink href="/signup" variant="primary" size="lg">
              Créer ma campagne
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink
              href="/galerie"
              variant="ghost"
              size="lg"
              className="border-white/25 text-white hover:border-white hover:bg-white/5"
            >
              Voir un exemple
            </ButtonLink>
          </div>

          <p className="mt-8 flex items-center gap-2 text-[13px] text-white/45">
            <Sparkles className="size-3.5" aria-hidden />
            Animation assistée et export vidéo inclus dans Créateur.
          </p>
        </div>
      </section>

      {/* ═══════════════ CAMPAGNES VEDETTES ═══════════════ */}
      <section className="overflow-hidden bg-white">
        <div className="container-shell py-20 md:py-28">
          <div className="grid items-center gap-10 md:grid-cols-2">
            {/* Left — Text */}
            <div>
              <h2 className="text-[36px] font-bold leading-tight md:text-[44px]">
                Campagnes{' '}
                <span className="text-brand-gradient font-script text-[42px] md:text-[52px]">
                  Vedettes
                </span>
              </h2>
              <p className="mt-4 text-base leading-relaxed text-gray-500">
                Vous êtes au SIAO ? Faites partie de la campagne.
              </p>
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-gray-500">
                Prenez votre plus belle photo et transformez-la en un visuel officiel aux couleurs du
                SIAO 2026.
              </p>
              <div className="mt-8">
                <ButtonLink
                  href="https://campagnes-nu.vercel.app/premium"
                  variant="primary"
                  size="md"
                >
                  Explorer les templates
                  <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              </div>
            </div>

            {/* Right — Featured campaign card */}
            <div className="relative">
              {/* Decorative gradient blob */}
              <div
                aria-hidden
                className="absolute -right-10 -top-10 size-[300px] rounded-full opacity-15"
                style={{
                  background:
                    'radial-gradient(circle, #7B61FF 0%, #FF6B6B 50%, #FFD93D 100%)',
                }}
              />

              <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                {/* Campaign preview area */}
                <div className="relative flex aspect-[16/10] items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                  {/* Placeholder for featured campaign preview */}
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex size-16 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-md">
                      <Play className="size-7" aria-hidden />
                    </div>
                    <div>
                      <p className="text-[22px] font-bold">{FEATURED.title}</p>
                      <p className="mt-1 text-[13px] text-gray-500">{FEATURED.subtitle}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                      {FEATURED.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-pill bg-white px-3 py-1 text-[12px] font-medium text-gray-700 shadow-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Badge "Campagne en vedette" */}
                  <span className="absolute right-3 top-3 rounded-pill bg-brand-gradient px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                    Campagne en vedette
                  </span>

                  {/* Ratio badge */}
                  <span className="absolute bottom-3 right-3 rounded-pill bg-ink/80 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                    {FEATURED.ratio}
                  </span>
                </div>

                {/* Creator bar */}
                <div className="flex items-center gap-3 border-t border-gray-100 px-5 py-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-gray-100 text-[12px] font-bold text-gray-500">
                    {FEATURED.creator.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold">{FEATURED.title}</p>
                    <p className="text-[12px] text-gray-500">{FEATURED.creator}</p>
                  </div>
                  <ChevronRight className="size-4 text-gray-400" aria-hidden />
                </div>
              </div>
                      <div className="mt-6 text-center md:text-left">
            <ButtonLink href="/premium" variant="primary" size="md">
              Découvrir Premium
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
          </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ CAMPAGNES À LA UNE ═══════════════ */}
      <section className="border-y border-gray-200 bg-white">
        <div className="container-shell py-20 md:py-28">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-3 text-[28px] font-bold leading-tight md:text-[36px]">
                <span
                  aria-hidden
                  className="hidden h-1 w-8 rounded-full sm:block"
                  style={{ background: 'var(--gradient-brand)' }}
                />
                Campagnes à la une
              </h2>
              <p className="mt-2 text-[15px] text-gray-500">
                Découvrez les campagnes les plus populaires du moment.
              </p>
            </div>
            <ButtonLink href="/galerie" variant="ghost" size="sm">
              Voir toutes les campagnes
              <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
          </header>

          <TrendingCampaigns limit={4} />
        </div>
      </section>

      {/* ═══════════════ ILS FONT CONFIANCE ═══════════════ */}
      <section className="border-b border-gray-200 bg-white">
        <div className="container-shell py-14 md:py-20">
          <div className="text-center md:text-left">
            <h2 className="text-[20px] font-bold leading-tight md:text-[24px]">
              Ils font confiance à Campagnes
            </h2>
            <p className="mt-2 text-[14px] text-gray-500">
              Associations, marques, institutions… déjà plus de 12 000 créateurs utilisent
              Campagnes.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-8 md:justify-between">
            {TRUST_LOGOS.map((name) => (
              <span
                key={name}
                className="text-[14px] font-semibold text-gray-400 transition-colors hover:text-gray-600"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ EXPLOREZ NOS TEMPLATES ═══════════════ */}
      <section className="bg-white">
        <div className="container-shell py-20 md:py-28">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-3 text-[28px] font-bold leading-tight md:text-[36px]">
                <span
                  aria-hidden
                  className="hidden h-1 w-8 rounded-full sm:block"
                  style={{ background: 'var(--gradient-brand)' }}
                />
                Explorez nos templates
              </h2>
              <p className="mt-2 text-[15px] text-gray-500">
                Trouvez le template parfait pour votre prochaine campagne.
              </p>
            </div>
            <ButtonLink href="/galerie" variant="ghost" size="sm">
              Voir tous les templates
              <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
          </header>

          {/* Filter pills */}
          <div className="mt-8 flex flex-wrap items-center gap-2">
            {TEMPLATE_FILTERS.map((filter, i) => (
              <span
                key={filter.id}
                className={
                  i === 0
                    ? 'inline-flex items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-[13px] font-medium text-white'
                    : 'inline-flex items-center gap-1.5 rounded-pill border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50'
                }
              >
                {filter.icon && <filter.icon className="size-3.5" aria-hidden />}
                {filter.label}
              </span>
            ))}
          </div>

          {/* Templates grid */}
          <TrendingTemplates limit={5} />
        </div>
      </section>

      {/* ═══════════════ CTA FINAL ═══════════════ */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, #7B61FF 0%, #FF6B6B 40%, #FFD93D 100%)',
          }}
          aria-hidden
        />
        {/* Decorative blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -left-20 bottom-0 size-[300px] rounded-full opacity-30"
            style={{
              background: 'radial-gradient(circle, #FF6B6B 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute -right-10 top-0 size-[250px] rounded-full opacity-30"
            style={{
              background: 'radial-gradient(circle, #7B61FF 0%, transparent 70%)',
            }}
          />
        </div>

        <div className="container-shell relative flex flex-col items-center justify-between gap-6 py-14 text-white sm:flex-row md:py-20">
          <div className="max-w-lg text-center sm:text-left">
            <h2 className="text-[24px] font-bold leading-tight md:text-[30px]">
              Votre idée. Notre outil. Un impact réel.
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-white/80">
              Rejoignez la communauté Campagnes et donnez vie à vos idées.
            </p>
          </div>
          <ButtonLink
            href="/signup"
            variant="ghost"
            size="lg"
            className="shrink-0 border-white/40 bg-white/10 text-white backdrop-blur-sm hover:border-white hover:bg-white/20"
          >
            Créer ma campagne
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <SiteFooter />
    </>
  );
}
