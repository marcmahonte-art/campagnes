'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, LayoutGrid, QrCode, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ProBadge } from '@/components/ui/badge';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  premium?: boolean;
}

const ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Mes campagnes', icon: LayoutGrid },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, premium: true },
  { href: '/qr-codes', label: 'QR Codes', icon: QrCode, premium: true },
  { href: '/settings', label: 'Paramètres', icon: Settings },
];

/** Navigation latérale (desktop) — volontairement courte (§15 du design system). */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        if (item.premium) {
          return (
            <span
              key={item.href}
              aria-disabled
              title="Disponible dans une prochaine version"
              className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2.5 text-sm text-gray-400"
            >
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              <span className="flex-1">{item.label}</span>
              <ProBadge />
            </span>
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

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden">
      <div className="flex items-stretch justify-around">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          if (item.premium) {
            return (
              <span
                key={item.href}
                className="flex flex-1 cursor-not-allowed flex-col items-center gap-1 py-2.5 text-[11px] text-gray-300"
              >
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                {item.label}
              </span>
            );
          }

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
