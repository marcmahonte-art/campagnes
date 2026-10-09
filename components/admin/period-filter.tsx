'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import {
  ADMIN_PERIODS,
  ADMIN_PERIOD_LABELS,
  normalizePeriod,
  type AdminPeriod,
} from '@/lib/admin/repository';

/**
 * Filtres globaux du Super Admin.
 *
 * La période vit dans l'URL : un onglet peut être rechargé, un lien peut être
 * partagé entre deux administrateurs, et l'état ne se perd pas au premier
 * rafraîchissement. Un état React local donnerait l'illusion inverse.
 */
export function PeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const period = normalizePeriod(params.get('period'));

  const setPeriod = (value: AdminPeriod) => {
    const next = new URLSearchParams(params.toString());
    next.set('period', value);
    next.delete('page');
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <label className="flex items-center gap-2 text-[13px] text-gray-500">
      <span className="sr-only">Période d’analyse</span>
      <select
        value={period}
        onChange={(event) => setPeriod(event.target.value as AdminPeriod)}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-ink"
      >
        {ADMIN_PERIODS.map((value) => (
          <option key={value} value={value}>
            {ADMIN_PERIOD_LABELS[value]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
    >
      <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} strokeWidth={1.75} aria-hidden />
      Actualiser
    </button>
  );
}

/** Champ de recherche piloté par l'URL, soumis sur Entrée. */
export function SearchFilter({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get('search');
        const next = new URLSearchParams(params.toString());
        if (typeof value === 'string' && value.trim()) {
          next.set('search', value.trim());
        } else {
          next.delete('search');
        }
        next.delete('page');
        router.replace(`${pathname}?${next.toString()}`);
      }}
    >
      <input
        type="search"
        name="search"
        defaultValue={params.get('search') ?? ''}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-56 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[13px] placeholder:text-gray-400"
      />
      <button
        type="submit"
        className="rounded-md border border-gray-200 px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-gray-50"
      >
        Chercher
      </button>
    </form>
  );
}

export function SelectFilter({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-[13px] text-gray-500">
      <span>{label}</span>
      <select
        value={params.get(name) ?? 'all'}
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          const value = event.target.value;
          if (value === 'all') next.delete(name);
          else next.set(name, value);
          next.delete('page');
          router.replace(`${pathname}?${next.toString()}`);
        }}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-ink"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
