import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface LogoProps {
  className?: string;
  variant?: 'black' | 'white';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  withTail?: boolean;
  asLink?: boolean;
}

/**
 * Logo Campagnes officiel avec sa terminaison dégradée signature.
 * Utilise la version fond clair (lettres noires) ou fond sombre (lettres blanches).
 */
export function Logo({
  className,
  variant = 'black',
  size = 'md',
  withTail = false,
  asLink = true,
}: LogoProps) {
  const sizes = {
    sm: 'h-8 md:h-9 w-auto',
    md: 'h-10 md:h-11 w-auto',
    lg: 'h-14 md:h-16 w-auto',
    xl: 'h-20 sm:h-24 md:h-28 w-auto',
  } as const;

  const src = variant === 'white' ? '/logo-white.png' : '/logo-campagnes.png';

  const content = (
    <span className={cn('inline-flex items-center select-none', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Campagnes"
        className={cn('object-contain max-w-full drop-shadow-sm', sizes[size])}
        loading="eager"
        decoding="async"
      />
    </span>
  );

  if (!asLink) return content;

  /*
   * La zone cliquable fait au moins 44 px de haut (spec §20), même quand le
   * logo n'en fait que 32 : le logo ne grandit pas, c'est la **zone de frappe**
   * qui s'agrandit. Sans ça, l'adresse du site est un lien de 32 px sous le
   * pouce — mesuré à 320 et 390 px par `tools/participant-ui-check`.
   */
  return (
    <Link
      href="/"
      aria-label="Campagnes — accueil"
      className="inline-flex min-h-11 items-center rounded-md py-1.5 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
    >
      {content}
    </Link>
  );
}
