'use client';

import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { ButtonLink } from '@/components/ui/button';
import { useSession } from '@/lib/backend/session';

export function SiteHeader({ transparent = false }: { transparent?: boolean }) {
  const { user, loading } = useSession();

  return (
    <header
      className={
        transparent
          ? 'absolute inset-x-0 top-0 z-20'
          : 'sticky top-0 z-20 border-b border-gray-200 bg-white/85 backdrop-blur'
      }
    >
      <div className="container-shell flex h-16 items-center justify-between">
        <Logo variant={transparent ? 'white' : 'black'} size="sm" />

        <nav className="flex items-center gap-2">
          {loading ? (
            <span className="h-9 w-28 animate-pulse rounded-pill bg-gray-100" aria-hidden />
          ) : user ? (
            <ButtonLink href="/dashboard" variant={transparent ? 'primary' : 'secondary'} size="sm">
              Mon dashboard
            </ButtonLink>
          ) : (
            <>
              <Link
                href="/login"
                className={
                  transparent
                    ? 'rounded-pill px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:text-white'
                    : 'rounded-pill px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:text-ink'
                }
              >
                Se connecter
              </Link>
              <ButtonLink href="/signup" variant="primary" size="sm">
                Créer ma campagne →
              </ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
