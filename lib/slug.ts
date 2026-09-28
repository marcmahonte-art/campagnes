/**
 * Slugify — même normalisation que la contrainte SQL
 * `^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$`.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Normalise un @pseudo — contrainte `^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$`. */
export function normalizeUsername(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 30);
}

export function isValidUsername(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$/.test(value);
}

export function isValidSlug(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(value);
}

/**
 * Rend un slug unique en suffixant `-2`, `-3`, … tant que `taken` le contient.
 * `taken` provient de la base (contrainte UNIQUE sur campaigns.slug).
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const root = base || 'campagne';
  if (!set.has(root)) return root;
  let n = 2;
  while (set.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

/** « Rentrée 2026 — UFHB » → « rentree-2026-ufhb » */
export function slugFromName(name: string): string {
  return slugify(name) || 'campagne';
}
