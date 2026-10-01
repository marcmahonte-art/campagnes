import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { COMPANY, PRODUCT } from '@/lib/company';

/**
 * Footer public du site.
 *
 * Composant serveur : aucun état, aucun script. Les pages légales doivent
 * rester les plus légères du site.
 *
 * La colonne « Légal » porte les quatre liens institutionnels, Signalement
 * compris — un signalement est une obligation de la plateforme, pas une
 * ressource facultative.
 */
const COLUMNS = [
  {
    title: 'Produit',
    links: [
      { href: '/galerie', label: 'Galerie' },
      { href: '/signup', label: 'Créer une campagne' },
      { href: '/tarifs', label: 'Tarifs' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { href: '/confidentialite', label: 'Confidentialité' },
      { href: '/conditions', label: 'Conditions' },
      { href: '/cookies', label: 'Cookies' },
      { href: '/signalement', label: 'Signalement' },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-gray-200 bg-white">
      <div className="container-shell py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(2,1fr)]">
          <div>
            <Logo size="sm" />
            <p className="mt-3 text-[13px] text-gray-500">{PRODUCT.tagline}</p>
            <p className="mt-4 text-[13px] leading-relaxed text-gray-500">
              {COMPANY.legalName}
              <br />
              {COMPANY.city}, {COMPANY.country}
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-labelledby={`footer-${column.title}`}>
              <h2 id={`footer-${column.title}`} className="text-[13px] font-semibold text-ink">
                {column.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-gray-500 transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-gray-200 pt-6 text-[12px] text-gray-400 md:flex-row md:items-center md:justify-between">
          <p>© {COMPANY.legalName} — Tous droits réservés.</p>
          <p>
            {COMPANY.legalForm} · RCCM {COMPANY.rccm} · Capital {COMPANY.shareCapital}
          </p>
        </div>
      </div>
    </footer>
  );
}
