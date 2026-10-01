import {
  ArrowRight,
  Heart,
  Users,
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

const TRENDING_CAMPAIGNS = [
  {
    id: '1',
    name: 'SIAO 2026',
    creator: 'Ministère du Commerce',
    category: 'Événement',
    categoryColor: '#7B61FF',
    likes: 12400,
    uses: 3200,
  },
  {
    id: '2',
    name: 'Bourse Étudiante 2025',
    creator: 'Association Jeunesse & Avenir',
    category: 'Association',
    categoryColor: '#FF6B6B',
    likes: 8700,
    uses: 1900,
  },
  {
    id: '3',
    name: 'Tournoi Inter-Universitaire',
    creator: 'FASO Sport',
    category: 'Sport',
    categoryColor: '#22C55E',
    likes: 6300,
    uses: 1400,
  },
  {
    id: '4',
    name: 'Festival Wagadou 2025',
    creator: 'Collectif Wagadou',
    category: 'Culture',
    categoryColor: '#FFD93D',
    likes: 5800,
    uses: 1200,
  },
];

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

const SAMPLE_TEMPLATES = [
  {
    id: 't1',
    name: 'Journée de la Femme',
    creator: 'Studio Campagnes',
    kind: 'Photo Frame',
    uses: 2400,
    isNew: true,
  },
  {
    id: 't2',
    name: 'Éducation pour tous',
    creator: 'Lumière Afrique',
    kind: 'Photo Frame',
    uses: 1800,
    ratio: '9:16',
  },
  {
    id: 't3',
    name: 'Sport & Jeunesse',
    creator: 'Vassi Sport',
    kind: 'Video Frame',
    uses: 1200,
    ratio: '16:9',
  },
  {
    id: 't4',
    name: 'Nature & Environnement',
    creator: 'Green Burkina',
    kind: 'Background Frame',
    uses: 956,
    ratio: '16:9',
  },
  {
    id: 't5',
    name: 'Solidarité',
    creator: 'Humanité Plus',
    kind: 'Photo Frame',
    uses: 743,
    ratio: '16:9',
  },
];

function compactNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

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
            Animation assistée et export vidéo inclus dans Creator.
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
                <ButtonLink href="/galerie" variant="primary" size="md">
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

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TRENDING_CAMPAIGNS.map((campaign) => (
              <article key={campaign.id} className="group relative flex flex-col">
                {/* Card image placeholder */}
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-50">
                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                    <span className="text-[15px] font-semibold text-gray-300">
                      {campaign.name}
                    </span>
                  </div>

                  {/* Category badge */}
                  <span
                    className="absolute left-3 top-3 rounded-pill px-2.5 py-1 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: campaign.categoryColor }}
                  >
                    {campaign.category}
                  </span>

                  {/* Hover overlay */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-end justify-center bg-ink/0 pb-4 opacity-0 transition-all duration-200 ease-brand group-hover:bg-ink/10 group-hover:opacity-100"
                  >
                    <span className="flex items-center gap-1.5 rounded-pill bg-white px-3.5 py-2 text-[13px] font-medium text-ink shadow-md">
                      Utiliser ce template
                      <ArrowRight className="size-3.5" aria-hidden />
                    </span>
                  </span>
                </div>

                {/* Info */}
                <div className="mt-3 flex flex-col gap-1.5">
                  <h3 className="text-[15px] font-semibold leading-snug">{campaign.name}</h3>
                  <div className="flex items-center gap-2 text-[13px] text-gray-500">
                    <div className="flex size-[18px] items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                      {campaign.creator.charAt(0)}
                    </div>
                    <span className="truncate">{campaign.creator}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Heart className="size-3" aria-hidden />
                      {compactNumber(campaign.likes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3" aria-hidden />
                      {compactNumber(campaign.uses)}
                    </span>
                  </div>
                </div>

                {/* Clickable overlay */}
                <a href="/galerie" className="absolute inset-0 rounded-lg" aria-label={`Voir ${campaign.name}`} />
              </article>
            ))}
          </div>
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
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
            {SAMPLE_TEMPLATES.map((template) => (
              <article key={template.id} className="group relative flex flex-col">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-50">
                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                    <span className="text-[13px] font-medium text-gray-300">{template.name}</span>
                  </div>

                  {/* Badges */}
                  <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                    {template.isNew && (
                      <span className="rounded-pill bg-brand-gradient px-2 py-0.5 text-[11px] font-semibold text-white">
                        Nouveau
                      </span>
                    )}
                    {template.ratio && (
                      <span className="ml-auto rounded-pill bg-white/85 px-2 py-0.5 text-[11px] font-medium text-gray-700 backdrop-blur-sm">
                        {template.ratio}
                      </span>
                    )}
                  </div>

                  {/* Hover */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-end justify-center bg-ink/0 pb-4 opacity-0 transition-all duration-200 ease-brand group-hover:bg-ink/10 group-hover:opacity-100"
                  >
                    <span className="flex items-center gap-1.5 rounded-pill bg-white px-3 py-1.5 text-[12px] font-medium text-ink shadow-md">
                      Utiliser
                      <ArrowRight className="size-3" aria-hidden />
                    </span>
                  </span>
                </div>

                <div className="mt-2.5 flex flex-col gap-1">
                  <h3 className="text-[14px] font-semibold leading-snug">{template.name}</h3>
                  <p className="text-[12px] text-gray-500">{template.creator}</p>
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                      {template.kind}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-2.5" aria-hidden />
                      {compactNumber(template.uses)}
                    </span>
                  </div>
                </div>

                <a href="/galerie" className="absolute inset-0 rounded-lg" aria-label={`Utiliser ${template.name}`} />
              </article>
            ))}
          </div>
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
