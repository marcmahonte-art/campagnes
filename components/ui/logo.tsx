import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Wordmark Campagnes — police script Satisfy (réservée au logo, §4 du design system).
 * La « terminaison dynamique » de la dernière lettre est reprise par un trait
 * dégradé sous le wordmark : c'est le seul endroit où le dégradé touche le logo.
 */
export function Logo({
  className,
  variant = 'black',
  size = 'md',
  withTail = false,
  asLink = true,
}: {
  className?: string;
  variant?: 'black' | 'white';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  withTail?: boolean;
  asLink?: boolean;
}) {
  const sizes = {
    sm: 'text-[22px]',
    md: 'text-[28px]',
    lg: 'text-[40px]',
    xl: 'text-[64px] md:text-[80px]',
  } as const;

  const content = (
    <span className={cn('inline-flex flex-col items-start leading-none', className)}>
      <span
        className={cn(
          'font-script',
          sizes[size],
          variant === 'white' ? 'text-white' : 'text-ink',
        )}
      >
        Campagnes
      </span>
      {withTail && (
        <span
          aria-hidden
          className="bg-brand-gradient mt-1 h-[3px] w-[62%] self-end rounded-pill"
        />
      )}
    </span>
  );

  if (!asLink) return content;

  return (
    <Link href="/" aria-label="Campagnes — accueil" className="inline-flex">
      {content}
    </Link>
  );
}
