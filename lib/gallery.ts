import { kindSpec } from './campaign-kinds';
import type { CampaignKind, GalleryCategory, GalleryItem, Ratio } from './types';

/**
 * Filtrage et tri de la galerie — **seul** endroit où ces règles sont écrites.
 *
 * Les écrans ne filtrent jamais une liste eux-mêmes : ils décrivent ce que le
 * visiteur a demandé et laissent ce module décider. Sinon la barre de filtres,
 * l'état vide et le compteur de résultats finissent par diverger.
 */

export type GallerySort = 'recent' | 'popular';

export interface GalleryFilters {
  /** Types retenus. Tableau vide = tous les types. */
  kinds: CampaignKind[];
  /** Formats retenus. Tableau vide = tous les formats. */
  ratios: Ratio[];
  categories: GalleryCategory[];
  officialOnly: boolean;
  query: string;
  sort: GallerySort;
}

export const NO_FILTERS: GalleryFilters = {
  kinds: [],
  ratios: [],
  categories: [],
  officialOnly: false,
  query: '',
  sort: 'recent',
};

export const GALLERY_CATEGORIES: { id: GalleryCategory; label: string }[] = [
  { id: 'evenements', label: 'Événements' },
  { id: 'associations', label: 'Associations' },
  { id: 'marques', label: 'Marques' },
  { id: 'education', label: 'Éducation' },
  { id: 'sport', label: 'Sport' },
  { id: 'communaute', label: 'Communauté' },
  { id: 'fetes', label: 'Fêtes' },
  { id: 'autres', label: 'Autres' },
];

export function categoryLabel(id: GalleryCategory): string {
  return GALLERY_CATEGORIES.find((c) => c.id === id)?.label ?? 'Autres';
}

/**
 * Nombre de filtres actifs, hors tri et hors recherche — c'est ce que porte la
 * pastille du bouton « Filtrer ». Le tri et la recherche sont déjà visibles
 * dans la barre : les compter deux fois donnerait un chiffre incompréhensible.
 */
export function activeFilterCount(filters: GalleryFilters): number {
  return (
    filters.kinds.length +
    filters.ratios.length +
    filters.categories.length +
    (filters.officialOnly ? 1 : 0)
  );
}

/**
 * Le tri « Populaire » n'a de sens que si au moins une campagne porte un
 * compteur réel. Sinon on le désactive au lieu de faire semblant : trier par
 * usage sur des compteurs inexistants reviendrait à dupliquer « Récent ».
 */
export function hasUsageData(items: GalleryItem[]): boolean {
  return items.some((item) => (item.usageCount ?? 0) > 0 || (item.likesCount ?? 0) > 0);
}

/** Catégories réellement présentes dans les données. */
export function presentCategories(items: GalleryItem[]): GalleryCategory[] {
  const seen = new Set<GalleryCategory>();
  items.forEach((item) => {
    if (item.category) seen.add(item.category);
  });
  return GALLERY_CATEGORIES.filter((c) => seen.has(c.id)).map((c) => c.id);
}

/** Minuscules sans accents — « Événements » doit se trouver en tapant « evenements ». */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function haystack(item: GalleryItem): string {
  return normalize(
    [
      item.name,
      item.creator?.org_name ?? '',
      item.creator?.username ?? '',
      kindSpec(item.kind).label,
      item.category ? categoryLabel(item.category) : '',
      item.ratio,
    ].join(' '),
  );
}

/** Tous les mots de la requête doivent apparaître : « festival 2026 » est un ET. */
function matchesQuery(item: GalleryItem, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  const hay = haystack(item);
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

export function filterGallery(items: GalleryItem[], filters: GalleryFilters): GalleryItem[] {
  const filtered = items.filter((item) => {
    if (filters.kinds.length > 0 && !filters.kinds.includes(item.kind)) return false;
    if (filters.ratios.length > 0 && !filters.ratios.includes(item.ratio)) return false;
    if (filters.categories.length > 0 && !(item.category && filters.categories.includes(item.category)))
      return false;
    if (filters.officialOnly && !item.isOfficial) return false;
    return matchesQuery(item, filters.query);
  });

  return filtered.sort((a, b) => {
    if (filters.sort === 'popular') {
      const usage = (b.usageCount ?? 0) - (a.usageCount ?? 0);
      if (usage !== 0) return usage;
      const likes = (b.likesCount ?? 0) - (a.likesCount ?? 0);
      if (likes !== 0) return likes;
    }
    // Les campagnes officielles remontent à activité comparable, sans jamais
    // passer devant une campagne réellement plus utilisée.
    if (Boolean(b.isOfficial) !== Boolean(a.isOfficial)) return a.isOfficial ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** « il y a 3 jours » — une date relative se lit mieux qu'un horodatage. */
export function relativeDate(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  if (days < 31) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'il y a une semaine' : `il y a ${weeks} semaines`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'il y a un mois' : `il y a ${months} mois`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'il y a un an' : `il y a ${years} ans`;
}

/** « 1 200 » → « 1,2 k ». Jamais plus de trois chiffres significatifs. */
export function compactCount(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands.toFixed(thousands < 10 ? 1 : 0).replace('.', ',')} k`;
}
