'use client';

import { cn } from '@/lib/cn';

/**
 * Avatar du créateur.
 *
 * Le logo du créateur quand il en a un, ses initiales sinon. Jamais d'image de
 * remplacement générique : un rond noir avec deux lettres dit « ce créateur n'a
 * pas encore de logo », ce qui est une information, alors qu'une silhouette
 * grise dit « la plateforme est cassée ».
 */
export function CreatorAvatar({
  name,
  logoUrl,
  size = 20,
  className,
}: {
  name: string;
  logoUrl: string | null;
  /** Diamètre en pixels. */
  size?: number;
  className?: string;
}) {
  const initials = name.replace(/^@/, '').slice(0, 2).toUpperCase();

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink font-semibold text-white',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.36)) }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
      ) : (
        initials
      )}
    </span>
  );
}
