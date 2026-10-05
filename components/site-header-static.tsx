'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, Search } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { ButtonLink } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';

/**
 * En-tête public statique.
 *
 * Il reprend les destinations visiteur de `SiteHeader`, sans lire la session ni
 * charger la couche backend. Sur `/tarifs`, cette nuance évite d'hydrater une
 * logique d'authentification alors que la page sert d'abord à lire les offres.
 */
export function SiteHeaderStatic({ transparent = false }: { transparent?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

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

        <nav className="hidden items-center gap-2 md:flex">
          <Link
            href="/galerie"
            className={
              transparent
                ? 'rounded-pill px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:text-white'
                : 'rounded-pill px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:text-ink'
            }
          >
            Galerie
          </Link>
          <Link
            href="/tarifs"
            className={
              transparent
                ? 'rounded-pill px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:text-white'
                : 'rounded-pill px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:text-ink'
            }
          >
            Tarifs
          </Link>
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
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/galerie"
            aria-label="Rechercher une campagne"
            className={iconButtonClass(transparent)}
          >
            <Search className="size-[18px]" strokeWidth={2} aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className={iconButtonClass(transparent)}
          >
            <Menu className="size-[18px]" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" side="right" className="md:hidden">
        <nav className="flex flex-col gap-1">
          <MenuLink href="/signup" onNavigate={() => setMenuOpen(false)} emphasis>
            Créer ma campagne
            <ArrowRight className="size-4" aria-hidden />
          </MenuLink>
          <MenuLink href="/galerie" onNavigate={() => setMenuOpen(false)}>
            Galerie
          </MenuLink>
          <MenuLink href="/tarifs" onNavigate={() => setMenuOpen(false)}>
            Tarifs
          </MenuLink>
          <MenuLink href="/login" onNavigate={() => setMenuOpen(false)}>
            Se connecter
          </MenuLink>
          <div className="mt-3">
            <ButtonLink href="/signup" variant="primary" size="md" className="w-full">
              Créer ma campagne
            </ButtonLink>
          </div>
        </nav>
      </Drawer>
    </header>
  );
}

function iconButtonClass(transparent: boolean): string {
  return transparent
    ? 'flex size-10 items-center justify-center rounded-pill border border-white/25 text-white transition-colors hover:border-white/60 hover:bg-white/10'
    : 'flex size-10 items-center justify-center rounded-pill border border-gray-200 text-gray-700 transition-colors hover:border-gray-400 hover:text-ink';
}

function MenuLink({
  href,
  children,
  onNavigate,
  emphasis = false,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={
        emphasis
          ? 'flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-4 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-gray-100'
          : 'flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-[15px] font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-ink'
      }
    >
      {children}
    </Link>
  );
}
