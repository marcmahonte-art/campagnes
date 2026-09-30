'use client';

import { useMemo, useState } from 'react';
import {
  Film,
  Image as ImageIcon,
  Images,
  LayoutTemplate,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TEMPLATES, type FrameTemplate } from '@/lib/templates';
import { cn } from '@/lib/cn';
import type { CampaignKind, Ratio } from '@/lib/types';

interface TemplatesModalProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (template: FrameTemplate, preserveContent: boolean) => void;
  currentKind?: CampaignKind;
  currentRatio?: Ratio;
}

/** Les filtres, dans l'ordre où ils apparaissent. */
const CATEGORIES: Array<{ id: FrameTemplate['category']; label: string }> = [
  { id: 'all', label: 'Tous' },
  { id: 'photo_frame', label: 'Cadre Photo' },
  { id: 'video_frame', label: 'Cadre Vidéo' },
  { id: 'background_frame', label: 'Photo sur Fond' },
];

export function TemplatesModal({
  open,
  onClose,
  onSelectTemplate,
  currentKind,
  currentRatio,
}: TemplatesModalProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FrameTemplate['category']>('all');
  const [selectedForConfirm, setSelectedForConfirm] = useState<FrameTemplate | null>(null);
  const [preserveContent, setPreserveContent] = useState(true);

  const filtered = useMemo(() => {
    return TEMPLATES.filter((tpl) => {
      if (category !== 'all' && tpl.category !== category) return false;
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const inTitle = tpl.title.toLowerCase().includes(query);
        const inDesc = tpl.description.toLowerCase().includes(query);
        const inTags = tpl.tags.some((t) => t.toLowerCase().includes(query));
        return inTitle || inDesc || inTags;
      }
      return true;
    }).sort((a, b) => {
      /*
       * Le type de la campagne d'abord. Un créateur qui fait une story ne
       * cherche pas d'abord un modèle Carré : sans cet ordre, la moitié de la
       * bibliothèque lui est proposée devant ce qui l'intéresse.
       */
      if (currentKind) {
        const mine = Number(b.kind === currentKind) - Number(a.kind === currentKind);
        if (mine !== 0) return mine;
      }
      return a.title.localeCompare(b.title, 'fr');
    });
  }, [category, currentKind, search]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="templates-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Fond sombre translucide */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => {
          setSelectedForConfirm(null);
          onClose();
        }}
        aria-hidden
      />

      {/* Conteneur principal */}
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-md bg-purple/10 text-purple">
              <LayoutTemplate className="size-5" />
            </div>
            <div>
              <h2 id="templates-title" className="text-[17px] font-bold text-ink">
                Modèles de Cadres
              </h2>
              <p className="text-[12px] text-gray-500">
                Choisissez une base de départ conçue pour vos événements et campagnes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Barre de recherche et filtres */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (ex: rentrée, festival, gala, story)…"
              className="h-9 w-full rounded-md border border-gray-200 bg-gray-50 pl-9 pr-3 text-[13px] placeholder:text-gray-400 focus:border-purple focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((cat) => {
              const count = TEMPLATES.filter((tpl) => tpl.category === cat.id).length;
              if (cat.id !== 'all' && count === 0) return null;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  aria-pressed={category === cat.id}
                  className={cn(
                    'rounded-pill px-3 py-1 text-[11px] font-medium transition-colors',
                    category === cat.id
                      ? 'bg-ink text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                  )}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grille de modèles */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
              <LayoutTemplate className="size-10 stroke-1 text-gray-300" />
              <p className="mt-3 text-sm font-medium">Aucun modèle ne correspond à votre recherche.</p>
              <p className="text-xs text-gray-400">Essayez un autre mot-clé ou réinitialisez les filtres.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {filtered.map((tpl) => {
                const isVideo = tpl.kind === 'video_frame';
                const isBg = tpl.kind === 'background_frame';

                return (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedForConfirm(tpl)}
                    className={cn(
                      'group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-all hover:border-purple hover:shadow-md',
                    )}
                  >
                    {/* Vignette d'aperçu schématique */}
                    <div className="relative flex h-36 w-full items-center justify-center overflow-hidden bg-gray-900 p-3">
                      <div
                        className={cn(
                          'relative flex items-center justify-center border border-white/20 bg-gray-800/80 shadow-inner',
                          tpl.ratio === '9:16' ? 'h-32 w-[4.5rem] rounded' : 'h-28 w-28 rounded-md',
                        )}
                      >
                        {/* Simulation visuelle */}
                        {isBg && (
                          <div className="size-16 rounded border border-dashed border-purple bg-purple/20 flex items-center justify-center">
                            <span className="text-[8px] font-medium text-purple-200">Zone photo</span>
                          </div>
                        )}
                        {!isBg && (
                          <div className="flex flex-col items-center justify-center gap-1 text-center p-1">
                            <span className="text-[10px] font-bold text-white line-clamp-1">
                              {tpl.title}
                            </span>
                            <span className="text-[8px] text-gray-300 font-mono">
                              {tpl.ratio}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Badges sur aperçu */}
                      <div className="absolute right-2 top-2 flex items-center gap-1">
                        {isVideo && (
                          <span className="flex items-center gap-1 rounded bg-coral/90 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur">
                            <Film className="size-2.5" /> Animé
                          </span>
                        )}
                        {isBg && (
                          <span className="flex items-center gap-1 rounded bg-purple/90 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur">
                            <Images className="size-2.5" /> Fond
                          </span>
                        )}
                        {!isVideo && !isBg && (
                          <span className="flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur">
                            <ImageIcon className="size-2.5" /> Cadre
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Informations du modèle */}
                    <div className="flex flex-1 flex-col justify-between p-3.5">
                      <div>
                        <h3 className="text-[13px] font-bold text-ink group-hover:text-purple">
                          {tpl.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-500">
                          {tpl.description}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-[11px] text-gray-400">
                        <span>
                          Format {tpl.ratio}
                          {/*
                            Le modèle est écrit dans son propre format et sera mis
                            à l'échelle. Le dire ici évite la surprise : on ne
                            verrait sinon qu'un cadre rétréci, sans explication.
                          */}
                          {currentRatio && currentRatio !== tpl.ratio && (
                            <span className="text-gray-400"> → {currentRatio}</span>
                          )}
                        </span>
                        <span className="font-medium text-purple opacity-0 transition-opacity group-hover:opacity-100">
                          Utiliser →
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal de confirmation de remplacement */}
        {selectedForConfirm && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 shadow-2xl">
              <h3 className="text-[15px] font-bold text-ink">
                Appliquer ce modèle ?
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-gray-600">
                Vous avez choisi <strong className="text-ink">{selectedForConfirm.title}</strong>.
                Le décor du cadre sera remplacé.
              </p>

              {currentRatio && currentRatio !== selectedForConfirm.ratio && (
                <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                  Ce modèle est conçu en {selectedForConfirm.ratio} ; il sera adapté à votre
                  format {currentRatio}.
                </p>
              )}

              <label className="mt-4 flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 p-2.5 text-[12px] text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preserveContent}
                  onChange={(e) => setPreserveContent(e.target.checked)}
                  className="rounded text-purple focus:ring-purple"
                />
                <span>Conserver mes textes et médias existants</span>
              </label>

              <div className="mt-5 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedForConfirm(null)}
                >
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onSelectTemplate(selectedForConfirm, preserveContent);
                    setSelectedForConfirm(null);
                    onClose();
                  }}
                >
                  Appliquer le modèle
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
