import Link from 'next/link';
import { PRODUCT } from '@/lib/company';

/**
 * Pied de page de la page événementielle.
 *
 * Il est **court par construction** : une signature, une ligne d'événement,
 * deux liens légaux. Pas de colonnes, pas de réassurance, pas de rappel des
 * formules — un footer marketing en bas d'une page de participation ramène le
 * visiteur à un site commercial au moment précis où il vient de télécharger son
 * visuel.
 *
 * Les deux liens légaux restent obligatoires : la page est publique et
 * indexable, elle doit offrir une porte de sortie sur ces sujets.
 *
 * Composant serveur : aucun état.
 */
export function PremiumFooter() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="container-shell flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[15px] font-semibold">Campagnes</p>
          <p className="mt-0.5 text-[13px] text-gray-500">{PRODUCT.tagline}</p>
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          <p className="text-[13px] text-gray-500">SIAO 2026 × Campagnes</p>
          <nav className="flex gap-4" aria-label="Liens légaux">
            <Link
              href="/conditions"
              className="text-[12px] text-gray-400 transition-colors hover:text-ink"
            >
              Conditions
            </Link>
            <Link
              href="/confidentialite"
              className="text-[12px] text-gray-400 transition-colors hover:text-ink"
            >
              Confidentialité
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
