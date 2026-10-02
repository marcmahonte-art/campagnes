import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

/**
 * En-tête de la page événementielle.
 *
 * Volontairement **plus pauvre** que celui du site : pas de « Galerie », pas de
 * « Tarifs », pas de bouton de création. Le visiteur arrive d'un QR code pour
 * participer au SIAO ; chaque lien supplémentaire est une façon de repartir
 * avant d'avoir téléchargé son visuel.
 *
 * Le retour vers Campagnes existe quand même — c'est une obligation de marque,
 * et un visiteur curieux doit pouvoir trouver le produit — mais il est discret,
 * en fin de barre, et n'occupe pas l'emplacement du CTA.
 *
 * Composant serveur : aucun état, aucun script embarqué sur une page qui doit
 * s'ouvrir vite depuis un téléphone en réseau mobile.
 */
export function PremiumHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="container-shell flex h-14 items-center justify-between gap-4 md:h-16">
        <Link
          href="/premium"
          className="flex min-w-0 items-center gap-2.5"
          aria-label="SIAO 2026 × Campagnes"
        >
          {/* Le mot SIAO domine, la marque suit : c'est l'événement que le
              visiteur vient reconnaître, pas le produit.
              Le logo est borné en largeur : son PNG est très allongé (2065×490),
              et `w-auto` seul le rendait soit minuscule, soit énorme selon la
              hauteur imposée. On plafonne donc explicitement. */}
          <span className="text-[17px] font-bold tracking-tight md:text-[19px]">SIAO</span>
          <span aria-hidden className="text-[15px] font-light text-gray-300">
            ×
          </span>
          <Logo size="sm" className="[&>img]:!h-6 md:[&>img]:!h-7 [&>img]:!w-auto" asLink={false} />
        </Link>

        <Link
          href="/"
          className="shrink-0 text-[12px] text-gray-500 transition-colors hover:text-ink sm:text-[13px]"
        >
          Campagnes
        </Link>
      </div>
    </header>
  );
}
