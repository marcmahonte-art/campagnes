import { ArrowRight, Frame, LayoutGrid, Share2, Sparkles, UserX, Zap } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Logo } from '@/components/ui/logo';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RATIO_LIST } from '@/lib/ratios';
import { PLAN_LIST, formatFcfa } from '@/lib/plans';

const STEPS = [
  {
    icon: Frame,
    title: 'Déposez votre cadre',
    text: 'Importez un PNG transparent, un logo, du texte. Positionnez. C’est prêt.',
  },
  {
    icon: LayoutGrid,
    title: 'Choisissez un format',
    text: 'Carré, Paysage ou Vertical. Campagnes gère la résolution, l’encodage et l’export.',
  },
  {
    icon: Share2,
    title: 'Publiez et partagez',
    text: 'Un lien unique. Votre communauté l’ouvre et repart avec son visuel.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* ---------- Hero : fond noir, dégradé en accent uniquement ---------- */}
      <section className="relative overflow-hidden bg-ink">
        <SiteHeader transparent />

        {/* Halos décoratifs — le dégradé reste un accent, jamais un fond plein. */}
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
            Un cadre. Un lien. Aucune installation. Le participant n’a même pas besoin de compte.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <ButtonLink href="/signup" variant="primary" size="lg">
              Créer ma campagne
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink
              href="/login"
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

      {/* ---------- Les 3 gestes ---------- */}
      <section className="container-shell py-20 md:py-28">
        <header className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            Je dépose → je positionne → c’est prêt
          </p>
          <h2 className="mt-3 text-[28px] font-bold leading-tight md:text-[36px]">
            Trois gestes, pas un logiciel de montage.
          </h2>
        </header>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Card key={step.title} className="p-6" interactive>
              <span className="flex size-10 items-center justify-center rounded-md bg-gray-50 text-ink">
                <step.icon className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="mt-5 block text-xs font-medium text-gray-400">
                Étape {index + 1}
              </span>
              <h3 className="mt-1 text-[20px] font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{step.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- Formats ---------- */}
      <section className="border-y border-gray-200 bg-gray-50">
        <div className="container-shell py-20 md:py-28">
          <header className="max-w-2xl">
            <h2 className="text-[28px] font-bold leading-tight md:text-[36px]">
              Trois formats. Aucune résolution à comprendre.
            </h2>
            <p className="mt-3 text-base text-gray-500">
              Vous choisissez une intention, Campagnes s’occupe de la technique.
            </p>
          </header>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {RATIO_LIST.map((spec) => {
              const height = 76;
              const width =
                spec.id === '1:1'
                  ? 76
                  : spec.id === '16:9'
                    ? Math.round((76 * 16) / 9)
                    : Math.round((76 * 9) / 16);
              return (
                <Card key={spec.id} className="p-6">
                  <span className="flex h-20 items-center justify-center">
                    <span
                      aria-hidden
                      style={{ width, height }}
                      className="rounded-sm border-2 border-gray-200 bg-white"
                    />
                  </span>
                  <h3 className="mt-5 text-[20px] font-semibold">{spec.label}</h3>
                  <p className="mt-1 text-sm text-gray-500">{spec.usage}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Sans compte participant ---------- */}
      <section className="container-shell py-20 md:py-28">
        <Card className="flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:p-12">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-gray-50">
            <UserX className="size-6" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <h2 className="text-[24px] font-semibold leading-snug md:text-[28px]">
              Le participant ne crée jamais de compte.
            </h2>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-gray-500">
              Il ouvre le lien, ajoute sa photo ou sa vidéo, repart avec son visuel. Chaque friction
              en moins, c’est une participation en plus.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm text-gray-500">
            <Zap className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
            Zéro installation
          </div>
        </Card>
      </section>

      {/* ---------- Tarifs (aperçu) ---------- */}
      <section className="border-t border-gray-200 bg-gray-50">
        <div className="container-shell py-20 md:py-28">
          <header className="max-w-2xl">
            <h2 className="text-[28px] font-bold leading-tight md:text-[36px]">
              Créer est gratuit. Diffuser se paie à l’usage.
            </h2>
            <p className="mt-3 text-base text-gray-500">
              Vous ne payez la distribution que lorsqu’un participant aboutit réellement. Partager un
              lien à 10 000 personnes ne consomme rien tant que personne ne participe.
            </p>
          </header>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PLAN_LIST.map((plan) => (
              <Card key={plan.id} className="p-6" interactive>
                <h3 className="text-[20px] font-semibold">{plan.name}</h3>
                <p className="mt-1 text-[13px] text-gray-500">{plan.tagline}</p>
                <p className="mt-4 text-[24px] font-bold leading-none">
                  {plan.priceFcfa === 0 ? 'Gratuit' : formatFcfa(plan.priceFcfa)}
                  {plan.priceFcfa > 0 && (
                    <span className="ml-1 text-[13px] font-medium text-gray-500">/ mois</span>
                  )}
                </p>
              </Card>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/tarifs" variant="secondary">
              Voir le détail des formules
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <span className="text-[13px] text-gray-500">
              Création et publication gratuites, sans carte bancaire.
            </span>
          </div>
        </div>
      </section>

      {/* ---------- Pied de page ---------- */}
      <SiteFooter />
    </>
  );
}
