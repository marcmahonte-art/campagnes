'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { Spinner } from '@/components/ui/feedback';
import { MobileTabBar, SidebarNav } from '@/components/dashboard/nav';
import { useSession } from '@/lib/backend/session';

/**
 * Coquille de l'espace créateur.
 * Garde d'accès côté client : pas de session → /login ; session non onboardée → /onboarding.
 */
export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, signOut } = useSession();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!user.onboarded_at) router.replace('/onboarding');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-5 text-gray-400" />
      </div>
    );
  }

  const displayName = user.org_name || user.username;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="mx-auto flex w-full max-w-shell gap-8 px-4 pb-24 pt-6 md:px-6 md:pb-10 md:pt-8">
        {/* ---------- Colonne latérale (desktop) ---------- */}
        <aside className="hidden w-56 shrink-0 flex-col md:flex">
          <Logo size="sm" />

          <div className="mt-8">
            <SidebarNav />
          </div>

          <div className="mt-auto pt-8">
            <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-3">
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-[11px] font-semibold text-white">
                {user.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.logo_url} alt="" className="size-full object-cover" />
                ) : (
                  initials
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-tight">{displayName}</p>
                <Link
                  href={`/u/${user.username}`}
                  className="truncate text-xs text-gray-500 transition-colors hover:text-ink"
                >
                  @{user.username}
                </Link>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  router.replace('/');
                }}
                aria-label="Se déconnecter"
                title="Se déconnecter"
                className="rounded-sm p-1.5 text-gray-400 transition-colors hover:text-ink"
              >
                <LogOut className="size-4" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </div>
        </aside>

        {/* ---------- Contenu ---------- */}
        <main className="min-w-0 flex-1">
          {/* En-tête mobile */}
          <div className="mb-6 flex items-center justify-between md:hidden">
            <Logo size="sm" />
            <Link
              href={`/u/${user.username}`}
              className="flex items-center gap-2 rounded-pill border border-gray-200 bg-white py-1 pl-1 pr-3 text-xs font-medium"
            >
              <span className="flex size-6 items-center justify-center overflow-hidden rounded-full bg-ink text-[9px] font-semibold text-white">
                {user.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.logo_url} alt="" className="size-full object-cover" />
                ) : (
                  initials
                )}
              </span>
              @{user.username}
            </Link>
          </div>

          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
