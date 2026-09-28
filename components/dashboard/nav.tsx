'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, LayoutGrid, QrCode, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ProBadge } from '@/components/ui/badge';
import { useSession } from '@/lib/backend/session';
import { hasFeature, type PlanFeature } from '@/lib/plans';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  /** Module conditionné par la formule. Absent = toujours accessible. */
  feature?: PlanFeature;
}

const ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Mes campagnes', icon: LayoutGrid },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, feature: 'analytics' },
  { href: '/qr-codes', label: 'QR Codes', icon: QrCode, feature: 'qr' },
  { href: '/settings', label: 'Paramètres', icon: Settings },
];

/**
 * Navigation latérale (desktop) — volontairement courte (§15 du design system).
 *
 * Les modules premium restent visibles quelle que soit la formule : verrouillés,
 * ils montrent ce qui existe ; débloqués, ils deviennent de simples liens.
 */
export function SidebarNav() {
  const pathname = usePathname();
  const { user } = useSession();

  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        const locked = item.feature ? !hasFeature(user?.plan, item.feature) : false;

        if (locked) {
          return (
            <Link
              key={item.href}
              href={`${item.href}`}
              title="Module premium — voir la formule requise"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-gray-400 transition-colors duration-150 ease-brand hover:bg-gray-50 hover:text-gray-700"
            >
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              <span className="flex-1">{item.label}</span>
              <ProBadge />
            </Link>
          );
        }

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

/** Barre d'onglets (mobile) — mêmes entrées, format tactile. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { user } = useSession();

  // Sur mobile, seules les entrées essentielles tiennent : les modules premium
  // verrouillés restent visibles depuis la page Paramètres.
  const items = ITEMS.filter((item) => !item.feature || hasFeature(user?.plan, item.feature));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden">
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors',
                active ? 'font-medium text-ink' : 'text-gray-500',
              )}
            >
              <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
