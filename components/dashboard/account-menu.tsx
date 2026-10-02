'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, CircleHelp, ExternalLink, LogOut, Settings } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { useSession } from '@/lib/backend/session';
import type { User } from '@/lib/types';

/**
 * Menu du compte — l'entrée mobile vers le profil et la déconnexion.
 *
 * Pourquoi un tiroir plutôt qu'un menu déroulant : le projet a déjà un tiroir
 * (`Drawer`) qui gère Échap, le clic extérieur, le blocage du défilement, le piège
 * à focus et le retour du focus sur le bouton. Le dupliquer pour obtenir une
 * simple liste de liens serait réécrire une mécanique déjà testée.
 *
 * Pourquoi il n'existe que sur mobile : sur desktop, la colonne latérale porte
 * déjà la carte d'identité et le bouton de déconnexion (`app/(creator)/layout.tsx`).
 * Les faire apparaître deux fois sur le même écran nuirait à la lisibilité sans
 * rien ajouter — ce menu ne comble donc que le manque réel, sur l'écran qui n'en
 * avait aucun.
 */
export function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { signOut } = useSession();

  const displayName = user.org_name || user.username;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menu du compte"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-pill border border-gray-200 bg-white py-1 pl-1 pr-2 text-xs font-medium transition-colors hover:border-ink"
      >
        <span className="flex size-7 items-center justify-center overflow-hidden rounded-full bg-ink text-[10px] font-semibold text-white">
          {user.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.logo_url} alt="" className="size-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <span className="max-w-[7.5rem] truncate">@{user.username}</span>
        <ChevronDown className="size-3.5 shrink-0 text-gray-400" aria-hidden />
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} side="bottom" title="Mon compte">
        <div className="flex flex-col">
          {/* Identité : elle n'était lisible que sur la colonne latérale. */}
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-[13px] font-semibold text-white">
              {user.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.logo_url} alt="" className="size-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
              <p className="truncate text-[13px] text-gray-500">@{user.username}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col">
            <Link
              href={`/u/${user.username}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-1 py-3 text-sm text-gray-700 transition-colors hover:text-ink"
            >
              <ExternalLink className="size-4 shrink-0 text-gray-400" strokeWidth={1.75} aria-hidden />
              Voir mon profil public
            </Link>

            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-1 py-3 text-sm text-gray-700 transition-colors hover:text-ink"
            >
              <Settings className="size-4 shrink-0 text-gray-400" strokeWidth={1.75} aria-hidden />
              Paramètres
            </Link>

            <Link
              href="/aide"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-1 py-3 text-sm text-gray-700 transition-colors hover:text-ink"
            >
              <CircleHelp className="size-4 shrink-0 text-gray-400" strokeWidth={1.75} aria-hidden />
              Aide
            </Link>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.replace('/');
              }}
              className="flex w-full items-center gap-3 rounded-md px-1 py-3 text-left text-sm font-medium text-error transition-colors hover:text-error/80"
            >
              <LogOut className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              Se déconnecter
            </button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
