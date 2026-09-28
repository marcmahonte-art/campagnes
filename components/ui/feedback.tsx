'use client';

import { AlertCircle, Info, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Message d'erreur en ligne — jamais d'alerte bloquante. */
export function InlineError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p className="flex items-start gap-2 rounded-md border border-error/25 bg-error/5 px-3 py-2 text-[13px] text-error">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function InlineInfo({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-700">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden />;
}

/** Bandeau discret signalant le mode de démonstration. */
export function DemoBanner() {
  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <div className="container-shell flex items-center gap-2 py-2 text-xs text-gray-500">
        <Info className="size-3.5 shrink-0" aria-hidden />
        <span>
          Mode démonstration — les données restent dans ce navigateur. Renseignez{' '}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">.env.local</code> pour
          activer Supabase.
        </span>
      </div>
    </div>
  );
}

export function DismissibleNotice({
  children,
  onDismiss,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-success/25 bg-success/5 px-4 py-3 text-sm text-gray-900">
      <div className="flex-1">{children}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer"
        className="rounded-sm p-1 text-gray-500 transition-colors hover:text-ink"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
