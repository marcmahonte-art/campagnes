import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { CampaignStatus } from '@/lib/types';

type Tone = 'neutral' | 'draft' | 'published' | 'premium' | 'error';

const TONES: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  draft: 'bg-white text-gray-700 border-gray-200',
  published: 'bg-success/10 text-success border-success/25',
  premium: 'bg-white text-ink border-transparent ring-brand-gradient',
  error: 'bg-error/10 text-error border-error/25',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Statut de campagne : brouillon ou publiée. */
export function StatusBadge({ status }: { status: CampaignStatus }) {
  if (status === 'published') {
    return (
      <Badge tone="published">
        <span className="size-1.5 rounded-full bg-success" aria-hidden />
        Publiée
      </Badge>
    );
  }
  return (
    <Badge tone="draft">
      <span className="size-1.5 rounded-full bg-gray-400" aria-hidden />
      Brouillon
    </Badge>
  );
}

/** Marqueur premium — visible mais non intrusif (§27 du design system). */
export function ProBadge() {
  return (
    <span className="ring-brand-gradient inline-flex items-center rounded-pill bg-white px-2 py-0.5 text-[11px] font-semibold tracking-wide text-ink">
      PRO
    </span>
  );
}
