'use client';

import { useId, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { KIND_SPECS } from '@/lib/campaign-kinds';
import { RATIO_LIST } from '@/lib/ratios';
import {
  GALLERY_CATEGORIES,
  NO_FILTERS,
  activeFilterCount,
  categoryLabel,
  hasUsageData,
  presentCategories,
  type GalleryFilters,
} from '@/lib/gallery';
import { cn } from '@/lib/cn';
import type { CampaignKind, GalleryItem, Ratio } from '@/lib/types';

/**
 * Barre de filtres.
 *
 * Trois niveaux seulement, du plus utile au plus rare : la recherche, le type
 * de campagne, puis un tiroir pour le reste. Tout afficher en même temps
 * donnerait une barre de quinze contrôles que personne ne lit.
 *
 * Les filtres de type reprennent **les trois types de campagne réellement
 * existants**. Le prompt proposait « Frames / Photo / Vidéo » : ces catégories
 * se recouvrent (une campagne « cadre vidéo » est à la fois un cadre et de la
 * vidéo) et un visiteur ne saurait pas laquelle choisir. On garde donc les trois
 * types du produit, qui partitionnent proprement les données.
 */

function Chip({
  active,
  onClick,
  children,
  disabled,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      title={title}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ease-brand',
        active
          ? 'border-ink bg-ink text-white'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:text-ink',
        disabled && 'cursor-not-allowed border-gray-200 bg-white text-gray-300 hover:border-gray-200',
      )}
    >
      {children}
    </button>
  );
}

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-[14px] transition-colors hover:bg-gray-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 shrink-0 accent-[color:var(--purple)]"
      />
      <span>{children}</span>
    </label>
  );
}

export function GalleryFiltersBar({
  filters,
  onChange,
  items,
  resultCount,
}: {
  filters: GalleryFilters;
  onChange: (next: GalleryFilters) => void;
  items: GalleryItem[];
  resultCount: number;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const searchId = useId();

  const kinds = filters.kinds;
  const advancedCount = activeFilterCount(filters);
  const usageAvailable = hasUsageData(items);
  const categories = presentCategories(items);

  const toggleKind = (kind: CampaignKind) => {
    const next = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind];
    onChange({ ...filters, kinds: next });
  };

  const toggleRatio = (ratio: Ratio) => {
    const next = filters.ratios.includes(ratio)
      ? filters.ratios.filter((r) => r !== ratio)
      : [...filters.ratios, ratio];
    onChange({ ...filters, ratios: next });
  };

  const patch = (part: Partial<GalleryFilters>) => onChange({ ...filters, ...part });

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- Recherche ---------------- */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gray-400"
          strokeWidth={1.75}
          aria-hidden
        />
        <label htmlFor={searchId} className="sr-only">
          Rechercher une campagne
        </label>
        <input
          id={searchId}
          type="search"
          value={filters.query}
          onChange={(e) => patch({ query: e.target.value })}
          placeholder="Rechercher une campagne…"
          className="h-11 w-full rounded-pill border border-gray-200 bg-white pl-11 pr-11 text-[15px] text-ink transition-colors duration-150 ease-brand placeholder:text-gray-400 focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/20"
        />
        {filters.query && (
          <button
            type="button"
            onClick={() => patch({ query: '' })}
            aria-label="Effacer la recherche"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm p-1.5 text-gray-400 transition-colors hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* ---------------- Filtres rapides ---------------- */}
      <div
        role="group"
        aria-label="Filtrer par type de campagne"
        className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Chip active={kinds.length === 0} onClick={() => patch({ kinds: [] })}>
          Tous
        </Chip>
        {KIND_SPECS.map((spec) => (
          <Chip key={spec.id} active={kinds.includes(spec.id)} onClick={() => toggleKind(spec.id)}>
            {spec.label}
          </Chip>
        ))}

        <span className="mx-1 h-5 w-px shrink-0 bg-gray-200" aria-hidden />

        <span role="group" aria-label="Trier" className="flex shrink-0 items-center gap-2">
          <Chip active={filters.sort === 'recent'} onClick={() => patch({ sort: 'recent' })}>
            Récent
          </Chip>
          <Chip
            active={filters.sort === 'popular'}
            onClick={() => patch({ sort: 'popular' })}
            disabled={!usageAvailable}
            title={
              usageAvailable
                ? undefined
                : 'Les compteurs d’utilisation ne sont pas encore alimentés.'
            }
          >
            Populaire
          </Chip>
        </span>

        <span className="mx-1 h-5 w-px shrink-0 bg-gray-200" aria-hidden />

        <button
          type="button"
          onClick={() => setAdvancedOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-pill border border-gray-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-gray-700 transition-colors duration-150 ease-brand hover:border-gray-400 hover:text-ink"
        >
          <SlidersHorizontal className="size-3.5" strokeWidth={1.75} aria-hidden />
          Filtrer
          {advancedCount > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
              {advancedCount}
            </span>
          )}
        </button>
      </div>

      {/* ---------------- Tiroir des filtres avancés ---------------- */}
      <Drawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        title="Filtrer"
        description="Affinez la galerie. Les filtres se cumulent."
        footer={
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => onChange({ ...NO_FILTERS, query: filters.query, sort: filters.sort })}
              disabled={advancedCount === 0}
            >
              Réinitialiser
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1"
              onClick={() => setAdvancedOpen(false)}
            >
              Voir {resultCount} {resultCount === 1 ? 'campagne' : 'campagnes'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-7">
          <fieldset>
            <legend className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              Format
            </legend>
            {RATIO_LIST.map((spec) => (
              <CheckRow
                key={spec.id}
                checked={filters.ratios.includes(spec.id)}
                onChange={() => toggleRatio(spec.id)}
              >
                {spec.label}
                <span className="ml-2 text-[13px] text-gray-500">{spec.usage}</span>
              </CheckRow>
            ))}
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              Catégorie
            </legend>
            {categories.length === 0 ? (
              /*
               * Aucune campagne n'est encore classée. On l'explique au lieu de
               * proposer huit cases qui ne renverraient toutes rien : un filtre
               * vide fait croire à une galerie vide.
               */
              <p className="px-2 py-2 text-[13px] leading-relaxed text-gray-500">
                Aucune campagne n’est encore classée par catégorie. Le classement arrive avec les
                prochaines publications.
              </p>
            ) : (
              GALLERY_CATEGORIES.filter((c) => categories.includes(c.id)).map((category) => (
                <CheckRow
                  key={category.id}
                  checked={filters.categories.includes(category.id)}
                  onChange={() =>
                    patch({
                      categories: filters.categories.includes(category.id)
                        ? filters.categories.filter((c) => c !== category.id)
                        : [...filters.categories, category.id],
                    })
                  }
                >
                  {categoryLabel(category.id)}
                </CheckRow>
              ))
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              Mise en avant
            </legend>
            <CheckRow
              checked={filters.officialOnly}
              onChange={() => patch({ officialOnly: !filters.officialOnly })}
            >
              Campagnes officielles uniquement
            </CheckRow>
          </fieldset>
        </div>
      </Drawer>
    </div>
  );
}
