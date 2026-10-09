import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Cartes et états du Super Admin.
 *
 * Deux règles portées par ces composants :
 *
 *   - **Une valeur non mesurée ne s'affiche jamais en 0.** Un zéro affirme
 *     « il n'y en a aucun » ; « Non mesuré » affirme « nous ne le savons pas ».
 *     Confondre les deux ferait passer une panne pour une absence d'usage.
 *   - **Chaque chiffre a une définition.** Un indicateur sans formule est une
 *     opinion chiffrée.
 */

export interface CounterLike {
  value: number;
  available?: boolean;
}

export function formatCounter(counter: CounterLike | undefined): string {
  if (!counter || counter.available === false) return 'Non mesuré';
  return new Intl.NumberFormat('fr-FR').format(counter.value);
}

export function formatFcfaCounter(counter: CounterLike | undefined): string {
  if (!counter || counter.available === false) return 'Non mesuré';
  return `${new Intl.NumberFormat('fr-FR').format(counter.value)} FCFA`;
}

export function AdminCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn('rounded-lg border border-gray-200 bg-white p-5 shadow-sm', className)}
    >
      {children}
    </section>
  );
}

export function AdminKpi({
  label,
  value,
  hint,
  definition,
}: {
  label: string;
  value: string;
  hint?: string;
  definition?: string;
}) {
  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      title={definition}
    >
      <p className="text-[12px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-[20px] font-semibold leading-none">{value}</p>
      {hint ? <p className="mt-2 text-[12px] leading-snug text-gray-500">{hint}</p> : null}
      {definition ? (
        <p className="mt-2 border-t border-gray-100 pt-2 text-[11px] leading-snug text-gray-400">
          {definition}
        </p>
      ) : null}
    </div>
  );
}

export function AdminSectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-[15px] font-semibold">{children}</h2>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint ? <p className="mt-1 text-[13px] text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-sm font-medium text-ink">Lecture impossible</p>
      <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-gray-200 px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-gray-50"
        >
          Réessayer
        </button>
      ) : null}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-gray-100', className)} />;
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'completed' || status === 'active' || status === 'published'
      ? 'border-gray-200 bg-gray-50 text-gray-700'
      : status === 'pending' || status === 'waiting_payment' || status === 'processing'
        ? 'border-warning/40 bg-warning/10 text-gray-700'
        : status === 'failed' || status === 'cancelled'
          ? 'border-error/40 bg-error/10 text-error'
          : 'border-gray-200 bg-white text-gray-500';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-medium',
        tone,
      )}
    >
      {status}
    </span>
  );
}

/** Courbe en barres — volontairement sans bibliothèque ni animation. */
export function SparkChart({
  points,
  label,
  valueSuffix = '',
}: {
  points: { date: string; value: number }[];
  label: string;
  valueSuffix?: string;
}) {
  const max = points.reduce((acc, point) => Math.max(acc, point.value), 0);
  const hasData = points.some((point) => point.value > 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-[12px] font-medium uppercase tracking-wide text-gray-400">{label}</p>

      {!hasData ? (
        <p className="mt-3 text-[13px] text-gray-500">Aucune donnée sur la période.</p>
      ) : (
        <>
          <div className="mt-4 flex h-24 items-end gap-[2px]">
            {points.map((point) => {
              const height = max > 0 ? Math.max(2, Math.round((point.value / max) * 100)) : 2;
              return (
                <div
                  key={point.date}
                  className="flex-1 rounded-sm bg-gray-300"
                  style={{ height: `${height}%` }}
                  title={`${point.date} : ${new Intl.NumberFormat('fr-FR').format(point.value)}${valueSuffix}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-gray-400">
            <span>{points[0]?.date}</span>
            <span>{points[points.length - 1]?.date}</span>
          </div>
        </>
      )}
    </div>
  );
}
