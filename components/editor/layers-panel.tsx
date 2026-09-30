'use client';

import {
  ArrowDown,
  ArrowUp,
  Copy,
  Crop,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Lock,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
import { SHAPES, shapeSpec } from '@/lib/shapes';
import { cn } from '@/lib/cn';
import type { Layer } from '@/lib/types';

interface LayersPanelProps {
  layers: Layer[];
  selectedId: string | null;
  photoAnchorId?: string;
  /** Plafond d'éléments, ou `null` si la formule n'en impose pas. */
  maxLayers?: number | null;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Désigne — ou retire — la zone du participant sur ce calque. */
  onSetPhotoZone: (id: string | null) => void;
}

function layerTitle(layer: Layer): string {
  if (layer.type === 'text') {
    const text = layer.text.trim();
    return text.length > 0 ? text : 'Texte sans titre';
  }
  if (layer.type === 'shape') {
    return shapeSpec(layer.kind).label;
  }
  return layer.label || 'Image';
}

/**
 * L'icône d'un calque est **la forme qu'il représente**, pas une pastille.
 *
 * Le tracé vient de `lib/shapes.ts`, la liste qui alimente le rendu : une forme
 * ne peut donc pas s'afficher « en pastille » et apparaître en étoile au
 * canvas. Le texte et l'image n'ont pas de tracé, ils gardent leur icône.
 */
function layerIcon(layer: Layer) {
  if (layer.type === 'text') {
    return <Type className="size-3.5 shrink-0 text-purple" />;
  }
  if (layer.type === 'shape') {
    const spec = SHAPES.find((shape) => shape.value === layer.kind);
    return (
      <svg
        viewBox="0 0 24 24"
        className="size-3.5 shrink-0"
        style={{ color: layer.fill === 'transparent' ? '#9CA3AF' : layer.fill }}
        aria-hidden
      >
        {/* Le contour est tracé par-dessus : une forme évidée doit rester
            lisible, sinon elle disparaîtrait de la liste. */}
        <path d={spec?.preview ?? ''} fill="currentColor" />
        {layer.strokeWidth > 0 && layer.stroke !== 'transparent' && (
          <path
            d={spec?.preview ?? ''}
            fill="none"
            stroke={layer.stroke}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
      </svg>
    );
  }
  return <ImageIcon className="size-3.5 shrink-0 text-coral" />;
}

export function LayersPanel({
  layers,
  selectedId,
  photoAnchorId,
  maxLayers,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onSetPhotoZone,
}: LayersPanelProps) {
  /*
   * Du premier plan vers l'arrière.
   *
   * L'ordre est celui de la pile, donc du `z` décroissant — l'inverse de l'ordre
   * du descripteur. Les boutons « Monter » et « Descendre » suivent cette
   * lecture : « Monter » rapproche du haut de la liste, c'est-à-dire du devant.
   */
  const sorted = [...layers].sort((a, b) => b.z - a.z);
  const atLimit = maxLayers !== null && maxLayers !== undefined && layers.length >= maxLayers;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <span className="text-[12px] font-semibold text-ink">
          Calques ({layers.length})
          {maxLayers !== null && maxLayers !== undefined && (
            <span className="ml-1 font-normal text-gray-400">/ {maxLayers}</span>
          )}
        </span>
        <span className="text-[10px] text-gray-400">Haut = premier plan</span>
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-[12px] leading-relaxed text-gray-400">
          Aucun calque dans ce cadre.
          <br />
          Ajoutez une image, un texte ou une forme depuis « Mon cadre ».
        </p>
      ) : (
        <ul className="flex max-h-[320px] flex-col gap-1 overflow-y-auto pr-1">
          {sorted.map((layer, idx) => {
            const isSelected = layer.id === selectedId;
            const isAnchor = layer.id === photoAnchorId;
            const isVisible = layer.visible !== false;
            const isLocked = Boolean(layer.locked);
            const canGoUp = idx > 0;
            const canGoDown = idx < sorted.length - 1;

            return (
              <li key={layer.id}>
                <div
                  onClick={() => onSelect(layer.id)}
                  className={cn(
                    'group flex cursor-pointer items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-[12px] transition-colors',
                    isSelected
                      ? 'border-purple bg-purple/5 font-medium text-ink'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                    !isVisible && 'bg-gray-50 opacity-60',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {layerIcon(layer)}
                    <span className="truncate" title={layerTitle(layer)}>
                      {layerTitle(layer)}
                    </span>
                    {isAnchor && (
                      <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-semibold text-gray-500">
                        Zone
                      </span>
                    )}
                  </div>

                  {/* Les actions ne sélectionnent pas : sinon chaque clic sur
                      « masquer » changerait de calque en cours de route. */}
                  <div
                    className="flex shrink-0 items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconAction
                      label={isVisible ? `Masquer « ${layerTitle(layer)} »` : `Afficher « ${layerTitle(layer)} »`}
                      onClick={() => onToggleVisible(layer.id)}
                      active={!isVisible}
                    >
                      {isVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </IconAction>

                    <IconAction
                      label={isLocked ? `Déverrouiller « ${layerTitle(layer)} »` : `Verrouiller « ${layerTitle(layer)} »`}
                      onClick={() => onToggleLock(layer.id)}
                      active={isLocked}
                    >
                      {isLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                    </IconAction>

                    <IconAction
                      label={`Définir « ${layerTitle(layer)} » comme zone photo`}
                      onClick={() => onSetPhotoZone(isAnchor ? null : layer.id)}
                      active={isAnchor}
                    >
                      <Crop className="size-3.5" />
                    </IconAction>

                    <IconAction
                      label={`Dupliquer « ${layerTitle(layer)} »`}
                      onClick={() => onDuplicate(layer.id)}
                      disabled={atLimit}
                    >
                      <Copy className="size-3.5" />
                    </IconAction>

                    <IconAction
                      label={`Monter « ${layerTitle(layer)} »`}
                      onClick={() => onMoveUp(layer.id)}
                      disabled={!canGoUp}
                    >
                      <ArrowUp className="size-3.5" />
                    </IconAction>

                    <IconAction
                      label={`Descendre « ${layerTitle(layer)} »`}
                      onClick={() => onMoveDown(layer.id)}
                      disabled={!canGoDown}
                    >
                      <ArrowDown className="size-3.5" />
                    </IconAction>

                    <IconAction
                      label={`Supprimer « ${layerTitle(layer)} »`}
                      onClick={() => onDelete(layer.id)}
                      danger
                    >
                      <Trash2 className="size-3.5" />
                    </IconAction>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {atLimit && (
        <p className="text-[11px] leading-relaxed text-gray-400">
          La formule limite à {maxLayers} éléments par cadre. Passez à une formule supérieure pour
          en ajouter.
        </p>
      )}
    </div>
  );
}

/** Un bouton icône de la liste : même rendu, mêmes attributs d'accessibilité. */
function IconAction({
  label,
  onClick,
  disabled = false,
  active = false,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded p-1 transition-colors disabled:pointer-events-none disabled:opacity-20',
        active
          ? 'text-purple'
          : danger
            ? 'text-gray-400 hover:bg-gray-100 hover:text-error'
            : 'text-gray-400 hover:bg-gray-100 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
