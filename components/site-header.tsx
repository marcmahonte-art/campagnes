'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, Search, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { ButtonLink } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { useSession } from '@/lib/backend/session';

/**
 * En-tête public, partagé par l'accueil, la galerie, /premium, /tarifs et les
 * pages légales.
 *
 * Sur grand écran, les entrées tiennent dans la barre. **Sous `md`, elles ne
 * tiennent plus** : la barre se réduit donc à la marque, une recherche et un
 * bouton de menu (`MobileMenu`). Sans ce repli, « Créer ma campagne » se
 * comprimait jusqu'à devenir illisible sur un téléphone.
 *
 * `transparent` sert la page d'accueil, dont le hero est sombre : la barre
 * s'y pose sans fond ni bordure.
 */
export function SiteHeader({ transparent = false }: { transparent?: boolean }) {
  const { user, loading } = useSession();
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

        {/* ───── Grand écran : barre complète ───── */}
        <nav className="hidden items-center gap-2 md:flex">
          {loading ? (
            <span className="h-9 w-28 animate-pulse rounded-pill bg-gray-100" aria-hidden />
          ) : user ? (
            <ButtonLink href="/dashboard" variant={transparent ? 'primary' : 'secondary'} size="sm">
              Mon dashboard
            </ButtonLink>
          ) : (
            <>
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
            </>
          )}
        </nav>

        {/* ───── Mobile : recherche + menu ───── */}
        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/galerie"
            aria-label="Rechercher une campagne"
            className={iconButtonClass(transparent)}
          >
            <Search className="size-[18px]" strokeWidth={2} aria-hidden />
          </Link>

          {/*
            Le bouton pousse `MobileMenu` à s'ouvrir. Pendant le chargement de la
            session, on l'affiche quand même : un bouton qui apparaît après coup
            déplace la barre sous le doigt.
          */}
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

      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        loading={loading}
      />
    </header>
  );
}

/** Cercle bordé des deux icônes mobiles — même dessin, fond clair ou sombre. */
function iconButtonClass(transparent: boolean): string {
  return transparent
    ? 'flex size-10 items-center justify-center rounded-pill border border-white/25 text-white transition-colors hover:border-white/60 hover:bg-white/10'
    : 'flex size-10 items-center justify-center rounded-pill border border-gray-200 text-gray-700 transition-colors hover:border-gray-400 hover:text-ink';
}

/**
 * Menu replié du mobile.
 *
 * Il porte **les mêmes destinations que la barre d'écran large**, plus une :
 * « Créer une campagne » pointe vers `/signup`. C'est la même page que
 * « Créer ma campagne » ci-dessus, nommée autrement pour tenir dans une ligne
 * de liste — pas une destination différente.
 *
 * Les entrées disparaissent quand la session est chargée et qu'un compte est
 * ouvert : « Se connecter » et « Créer ma campagne » n'ont alors plus de sens.
 * Le bouton `•••` et « Mon dashboard » les remplacent.
 */
function MobileMenu({
  open,
  onClose,
  user,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  user: unknown;
  loading: boolean;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Menu" side="right" className="md:hidden">
      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-11 animate-pulse rounded-lg bg-gray-100" aria-hidden />
          ))}
        </div>
      ) : (
        <nav className="flex flex-col gap-1">
          <MenuLink href="/signup" onNavigate={onClose} emphasis>
            Créer une campagne
            <ArrowRight className="size-4" aria-hidden />
          </MenuLink>
          <MenuLink href="/galerie" onNavigate={onClose}>
            Galerie
          </MenuLink>
          <MenuLink href="/tarifs" onNavigate={onClose}>
            Tarifs
          </MenuLink>

          {user ? (
            <MenuLink href="/dashboard" onNavigate={onClose}>
              Mon dashboard
            </MenuLink>
          ) : (
            <>
              <MenuLink href="/login" onNavigate={onClose}>
                Se connecter
              </MenuLink>
              <div className="mt-3">
                <ButtonLink href="/signup" variant="primary" size="md" className="w-full">
                  Créer ma campagne
                </ButtonLink>
              </div>
            </>
          )}
        </nav>
      )}
    </Drawer>
  );
}

/**
 * Une entrée du menu. `onNavigate` ferme le tiroir : sans cela, la page change
 * mais le tiroir reste ouvert par-dessus la nouvelle route.
 */
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
