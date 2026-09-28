import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'md' | 'sm' | 'lg';

const VARIANTS: Record<Variant, string> = {
  // Le dégradé reste réservé au CTA principal (§9 du design system).
  primary:
    'bg-brand-gradient text-white shadow-sm hover:shadow-md active:scale-[.985] focus-visible:outline-purple',
  secondary: 'bg-ink text-white hover:bg-gray-900 active:scale-[.985]',
  ghost: 'bg-transparent text-ink border border-gray-200 hover:border-ink hover:bg-gray-50',
  destructive: 'bg-white text-error border border-error/40 hover:bg-error hover:text-white',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-all duration-200 ease-brand ' +
  'disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  className,
  children,
  target,
}: CommonProps & { href: string; target?: string }) {
  const isExternal = href.startsWith('http');
  if (isExternal) {
    return (
      <a
        href={href}
        target={target ?? '_blank'}
        rel="noreferrer"
        className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cn(BASE, VARIANTS[variant], SIZES[size], className)}>
      {children}
    </Link>
  );
}
