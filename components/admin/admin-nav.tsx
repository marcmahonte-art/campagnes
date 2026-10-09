'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, CreditCard, LayoutGrid, Megaphone, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ADMIN_ROLE_LABELS, type AdminRole } from '@/lib/admin/auth';

/**
 * Navigation du Super Admin — composant client.
 *
 * `usePathname` interdit l'usage serveur : l'entrée active se déduit de l'URL
 * courante, pas d'un état. Fichier séparé pour cette seule raison — la coquille
 * reste un composant serveur, donc jamais expédiée au navigateur.
 *
 * La liste est **volontairement courte** : elle ne cite que des pages qui
 * lisent des données réellement disponibles. Une rubrique qui afficherait des
 * zéros par défaut ferait croire à un produit fini là où l'instrumentation
 * manque.
 */

const ITEMS = [
  { href: '/super-admin', label: 'Vue d’ensemble', icon: LayoutGrid, exact: true },
  { href: '/super-admin/users', label: 'Utilisateurs', icon: Users, exact: false },
  { href: '/super-admin/payments', label: 'Paiements', icon: CreditCard, exact: false },
  { href: '/super-admin/campaigns', label: 'Campagnes', icon: Megaphone, exact: false },
  { href: '/super-admin/system', label: 'Système', icon: Activity, exact: false },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors duration-150 ease-brand',
              active ? 'bg-gray-100 font-medium text-ink' : 'text-gray-700 hover:bg-gray-50',
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 md:hidden">
      {ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[13px] transition-colors',
              active ? 'bg-gray-100 font-medium text-ink' : 'text-gray-600',
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminRoleBadge({ role }: { role: AdminRole }) {
  return (
    <span className="inline-flex items-center rounded-pill border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600">
      {ADMIN_ROLE_LABELS[role] ?? role}
    </span>
  );
}
