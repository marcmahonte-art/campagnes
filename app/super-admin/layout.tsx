import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/admin/auth';
import { AdminBrand } from '@/components/admin/admin-shell';
import { AdminMobileNav, AdminRoleBadge, AdminSidebar } from '@/components/admin/admin-nav';

/**
 * Coquille du Super Admin — garde côté serveur.
 *
 * La protection est ici, pas dans le navigateur : un `useEffect` qui
 * redirige laisse le temps d'afficher une frame et, surtout, ne protège rien
 * du tout côté API. Une page rendue côté serveur ne répond jamais « accès
 * refusé » après avoir déjà répondu 200 avec du contenu.
 *
 * L'espace est aussi exclu de l'indexation : un outil interne n'a aucune
 * raison d'être découvrable.
 */

export const metadata: Metadata = {
  title: 'Administration — Campagnes',
  robots: { index: false, follow: false },
};

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminContext();

  if (!admin) {
    redirect('/login?next=%2Fsuper-admin');
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <AdminMobileNav />

      <div className="mx-auto flex w-full max-w-shell gap-8 px-4 py-6 md:px-6 md:py-8">
        <aside className="hidden w-56 shrink-0 flex-col md:flex">
          <AdminBrand />
          <div className="mt-8">
            <AdminSidebar />
          </div>

          <div className="mt-auto pt-8">
            <AdminRoleBadge role={admin.role} />
            <p className="mt-3 text-[11px] leading-snug text-gray-400">
              Session administrateur tracée. Les exports et les actions sensibles sont
              journalisés.
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
