import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { TO_COMPLETE } from '@/lib/company';

/**
 * Coquille commune aux pages institutionnelles.
 *
 * Elle porte l'en-tête, le fil d'Ariane, le sommaire et le footer — les quatre
 * pages légales ne définissent donc que leur contenu. Le sommaire est collant
 * sur desktop et replié dans un `<details>` sur mobile : c'est le navigateur qui
 * gère l'ouverture, aucun script n'est nécessaire.
 *
 * Composant serveur : ces pages doivent rester les plus légères du site.
 */
export interface LegalSection {
  id: string;
  title: string;
}

export function LegalPageLayout({
  title,
  subtitle,
  updatedAt,
  sections,
  children,
}: {
  title: string;
  subtitle: string;
  /** Texte affiché tel quel. Ne jamais calculer une date « du jour ». */
  updatedAt: string;
  sections: LegalSection[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-white">
      <SiteHeader />

      <main className="container-shell py-10 md:py-16">
        <div className="mx-auto max-w-5xl">
          <nav aria-label="Fil d'Ariane">
            <ol className="flex items-center gap-2 text-[13px] text-gray-500">
              <li>
                <Link href="/" className="transition-colors hover:text-ink">
                  Accueil
                </Link>
              </li>
              <li aria-hidden className="text-gray-400">
                /
              </li>
              <li aria-current="page" className="text-ink">
                {title}
              </li>
            </ol>
          </nav>

          <header className="mt-6">
            <h1 className="text-[30px] font-bold leading-tight text-ink md:text-[38px]">{title}</h1>
            {/* Le seul accent graphique de la page : un filet de marque. */}
            <div aria-hidden className="mt-4 h-1 w-16 rounded-pill bg-brand-gradient" />
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-gray-500">{subtitle}</p>
            <p className="mt-4 text-[13px] text-gray-400">
              Dernière mise à jour : <span className="text-gray-500">{updatedAt}</span>
            </p>
          </header>

          <details className="mt-8 rounded-lg border border-gray-200 md:hidden">
            <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-ink">
              Sur cette page
            </summary>
            <nav aria-label="Sommaire" className="px-4 pb-4">
              <ol className="flex flex-col gap-2">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-[13px] leading-snug text-gray-500 transition-colors hover:text-ink"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </details>

          <div className="mt-8 grid gap-10 md:grid-cols-[220px_1fr] md:gap-14">
            <aside className="hidden md:block">
              <nav aria-label="Sommaire" className="sticky top-24">
                <p className="text-[13px] font-semibold text-ink">Sur cette page</p>
                <ol className="mt-4 flex flex-col gap-2 border-l border-gray-200 pl-4">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="text-[13px] leading-snug text-gray-500 transition-colors hover:text-ink"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>

            {/* Largeur de lecture bornée : au-delà, l'œil perd la ligne. */}
            <article className="min-w-0 max-w-[68ch] space-y-9">{children}</article>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** Une section numérotée, ancrable depuis le sommaire. */
export function LegalBlock({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-[19px] font-semibold leading-snug text-ink md:text-[21px]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

/**
 * Marque une information qui n'a pas été fournie.
 *
 * Elle reste visible : mieux vaut un manque assumé qu'une donnée inventée.
 */
export function ToComplete() {
  return (
    <span className="inline-block rounded-sm border border-dashed border-gray-400 px-1.5 py-px align-baseline text-[12px] font-medium text-gray-500">
      {TO_COMPLETE}
    </span>
  );
}
