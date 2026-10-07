'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { Spinner } from '@/components/ui/feedback';
import { PlanBadge } from '@/components/plans/plan-card';
import { AccountMenu } from '@/components/dashboard/account-menu';
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
    if (!user) {
      const destination = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(destination)}`);
    } else if (!user.onboarded_at) {
      const destination = `${window.location.pathname}${window.location.search}`;
      router.replace(`/onboarding?next=${encodeURIComponent(destination)}`);
    }
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

          <div className="mt-auto flex flex-col gap-3 pt-8">
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

            <div className="flex items-center justify-between gap-2 px-1">
              <PlanBadge plan={user.plan} />
              <div className="flex items-center gap-3">
                <Link
                  href="/aide"
                  className="text-[12px] text-gray-500 underline underline-offset-4 transition-colors hover:text-ink"
                >
                  Aide
                </Link>
                <Link
                  href="/settings#formule"
                  className="text-[12px] text-gray-500 underline underline-offset-4 transition-colors hover:text-ink"
                >
                  Gérer
                </Link>
              </div>
            </div>
          </div>
        </aside>

        {/* ---------- Contenu ---------- */}
        <main className="min-w-0 flex-1">
          {/* En-tête mobile — le logo à gauche, le compte à droite.
              Le profil et la déconnexion vivaient dans la colonne latérale, masquée
              en dessous de `md` : ils étaient donc inatteignables sur téléphone.
              `AccountMenu` les rend accessibles sans rien retirer à cet écran. */}
          <div className="mb-6 flex items-center justify-between gap-3 md:hidden">
            <Logo size="sm" />
            <AccountMenu user={user} />
          </div>

          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
