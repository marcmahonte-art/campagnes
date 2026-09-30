'use client';

import Link from 'next/link';
import { ImagePlus, Lock, Trash2, Type, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RatioPicker } from '@/components/ui/ratio-picker';
import {
  ColorRow,
  Disclosure,
  PanelHeading,
  RangeRow,
  Segmented,
} from '@/components/editor/controls';
import { kindSpec } from '@/lib/campaign-kinds';
import { ratioSpec } from '@/lib/ratios';
import type {
  CampaignKind,
  Descriptor,
  ImageLayer,
  Layer,
  Ratio,
  TextAlign,
  TextLayer,
} from '@/lib/types';

/**
 * Panneau contextuel droit.
 *
 * Règle : **jamais toutes les options en même temps**. Le panneau ne montre que
 * ce qui concerne la sélection courante — rien de sélectionné, et c'est le
 * cadre ; un texte, et ce sont les réglages d'un texte.
 *
 * Règle corollaire : aucune coordonnée, aucune largeur en pixels. La taille se
 * lit en proportion du cadre et s'affiche en mot, pas en chiffre.
 */

export type LayerPatch = Partial<TextLayer> & Partial<ImageLayer>;

/* ------------------------------------------------------------------ */
/* Vocabulaire                                                         */
/* ------------------------------------------------------------------ */

function layerLabel(layer: Layer): string {
  if (layer.type === 'text') {
    const text = layer.text.trim();
    return text.length > 0 ? `« ${text.slice(0, 24)} »` : 'Texte';
  }
  return layer.label?.trim() || 'Image';
}

/** Largeur en proportion du cadre — jamais une valeur en pixels. */
function sizePercent(layer: Layer, ratio: Ratio): number {
  const spec = ratioSpec(ratio);
  return Math.max(5, Math.min(100, Math.round((layer.w / spec.width) * 100)));
}

function sizeWord(percent: number): string {
  if (percent <= 20) return 'Très petit';
  if (percent <= 40) return 'Petit';
  if (percent <= 65) return 'Moyen';
  if (percent <= 85) return 'Grand';
  return 'Très grand';
}

/* ------------------------------------------------------------------ */
/* Aucune sélection : le cadre                                         */
/* ------------------------------------------------------------------ */

export function FramePanel({
  descriptor,
  kind,
  maxLayers,
  onAddImage,
  onAddText,
  onChangeRatio,
  busy,
  locked,
  onToggleLock,
}: {
  descriptor: Descriptor;
  kind: CampaignKind;
  /** Plafond imposé par la formule. `null` = illimité. */
  maxLayers: number | null;
  onAddImage: () => void;
  onAddText: () => void;
  onChangeRatio: (ratio: Ratio) => void;
  busy: boolean;
  /** La zone du participant est verrouillée : elle ne bouge plus par accident. */
  locked: boolean;
  onToggleLock: () => void;
}) {
  const spec = kindSpec(kind);
  const count = descriptor.layers.length;
  const limitReached = maxLayers !== null && count >= maxLayers;

  return (
    <div className="flex flex-col gap-5">
      <PanelHeading title="Mon cadre" hint={spec.detail} />

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-medium text-gray-700">Ajouter</span>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" size="sm" onClick={onAddImage} disabled={busy || limitReached}>
            <ImagePlus className="size-4" strokeWidth={1.75} aria-hidden />
            Image
          </Button>
          <Button variant="ghost" size="sm" onClick={onAddText} disabled={limitReached}>
            <Type className="size-4" strokeWidth={1.75} aria-hidden />
            Texte
          </Button>
        </div>

        {maxLayers !== null && (
          <p className="text-[11px] text-gray-400">
            {count} / {maxLayers} éléments
          </p>
        )}

        {/* On ne cache jamais ce qui existe : la limite reste visible, avec la
            formule qui la lève. On ne désactive pas en silence. */}
        {limitReached && (
          <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-[12px] leading-relaxed text-gray-600">
            La formule Free limite à {maxLayers} éléments par cadre.{' '}
            <Link href="/tarifs" className="font-medium text-ink underline underline-offset-4">
              Frame Pro les rend illimités
            </Link>
            .
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-gray-700">Format</span>
          <p className="text-[11px] leading-relaxed text-gray-500">
            Le cadre est automatiquement redimensionné dans le nouveau repère.
          </p>
        </div>
        <RatioPicker value={descriptor.ratio} onChange={onChangeRatio} />
      </div>

      {/*
        Le déverrouillage de la zone est volontairement caché ici, et nulle part
        ailleurs : la zone étant verrouillée, elle n'est plus sélectionnable — un
        bouton posé sur l'élément lui-même serait inaccessible au moment précis
        où on en a besoin.
      */}
      <Disclosure label="Plus de réglages">
        <p className="text-[11px] leading-relaxed text-gray-500">
          {locked
            ? 'La zone du participant est verrouillée : elle ne bougera pas si vous déplacez autre chose.'
            : 'La zone du participant est déverrouillée : vous pouvez la déplacer librement.'}
        </p>
        <Button variant="ghost" size="sm" onClick={onToggleLock}>
          {locked ? (
            <>
              <Unlock className="size-4" strokeWidth={1.75} aria-hidden />
              Déverrouiller la zone
            </>
          ) : (
            <>
              <Lock className="size-4" strokeWidth={1.75} aria-hidden />
              Verrouiller la zone
            </>
          )}
        </Button>
      </Disclosure>

      <p className="text-[11px] leading-relaxed text-gray-400">
        Sélectionnez un élément du cadre pour le modifier, ou glissez une image directement sur
        la scène.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Un élément sélectionné                                              */
/* ------------------------------------------------------------------ */

export function LayerPanel({
  layer,
  ratio,
  isZone,
  otherZone,
  onPatch,
  onDelete,
  onOrder,
  onToggleZone,
}: {
  layer: Layer;
  ratio: Ratio;
  /** Ce calque délimite la zone photo du parcours participant. */
  isZone: boolean;
  /** Le calque qui délimite déjà la zone, s'il s'agit d'un autre. */
  otherZone: Layer | null;
  onPatch: (patch: LayerPatch) => void;
  onDelete: () => void;
  onOrder: (direction: 'front' | 'back') => void;
  onToggleZone: () => void;
}) {
  const isText = layer.type === 'text';
  const spec = ratioSpec(ratio);

  return (
    <div className="flex flex-col gap-4">
      <PanelHeading
        title={isText ? 'Mon texte' : 'Mon image'}
        hint={layerLabel(layer)}
      />

      {/* ---------------- Contenu du texte ---------------- */}
      {isText && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="layer-text" className="text-[12px] font-medium text-gray-700">
            Votre texte
          </label>
          <Input
            id="layer-text"
            value={layer.text}
            onChange={(e) => onPatch({ text: e.target.value })}
            placeholder="Votre message"
          />
        </div>
      )}

      {/*
        Taille. Un texte ne se redimensionne pas comme une image : on change
        son corps, pas sa boîte — redimensionner la boîte d'un texte recompose
        la mise en page à chaque geste et fait « sauter » l'élément.
      */}
      {isText ? (
        <RangeRow
          label="Taille du texte"
          min={16}
          max={400}
          step={2}
          value={layer.size}
          display={sizeWord(Math.round((layer.size / 400) * 100))}
          onChange={(size) => onPatch({ size })}
        />
      ) : (
        <RangeRow
          label="Taille"
          min={5}
          max={100}
          step={1}
          value={sizePercent(layer, ratio)}
          display={sizeWord(sizePercent(layer, ratio))}
          onChange={(percent) => {
            const w = Math.round((spec.width * percent) / 100);
            const currentW = layer.w || 1;
            const h = Math.round((layer.h * w) / currentW);
            onPatch({ w, h });
          }}
        />
      )}

      {/* ---------------- Ordre ---------------- */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" size="sm" onClick={() => onOrder('front')}>
          Devant
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOrder('back')}>
          Derrière
        </Button>
      </div>

      {/* ---------------- Zone photo ---------------- */}
      <div
        className={
          isZone
            ? 'flex flex-col gap-2 rounded-md border border-ink bg-gray-50 p-3'
            : 'flex flex-col gap-2 rounded-md border border-gray-200 p-3'
        }
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-gray-700">Zone du participant</span>
          {isZone && (
            <span className="rounded-pill bg-ink px-2 py-0.5 text-[10px] font-medium text-white">
              Active
            </span>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-gray-500">
          {isZone
            ? 'Les participants placeront leur photo ici. Ce calque est masqué dans la zone et reste visible tout autour.'
            : 'La photo du participant s’affichera à l’emplacement de ce calque.'}
        </p>

        {!isZone && otherZone && (
          <p className="text-[11px] text-gray-400">
            Remplace la zone actuelle : {layerLabel(otherZone)}.
          </p>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleZone}
          className={isZone ? 'text-error' : undefined}
        >
          {isZone ? 'Retirer la zone' : 'Définir comme zone'}
        </Button>
      </div>

      {/* ---------------- Options secondaires ---------------- */}
      <Disclosure label="Plus de réglages">
        {isText && (
          <>
            <ColorRow
              label="Couleur"
              value={layer.color}
              onChange={(color) => onPatch({ color })}
            />
            <Segmented<TextAlign>
              label="Alignement"
              value={layer.align}
              options={[
                { value: 'left', label: 'Gauche' },
                { value: 'center', label: 'Centre' },
                { value: 'right', label: 'Droite' },
              ]}
              onChange={(align) => onPatch({ align })}
            />
          </>
        )}

        <RangeRow
          label="Opacité"
          min={0.05}
          max={1}
          step={0.05}
          value={layer.opacity}
          display={`${Math.round(layer.opacity * 100)} %`}
          onChange={(opacity) => onPatch({ opacity })}
        />

        <RangeRow
          label="Rotation"
          min={-180}
          max={180}
          step={1}
          value={layer.rotation}
          display={`${layer.rotation}°`}
          onChange={(rotation) => onPatch({ rotation })}
        />
      </Disclosure>

      <Button variant="destructive" size="sm" onClick={onDelete}>
        <Trash2 className="size-4" strokeWidth={1.75} aria-hidden />
        Supprimer
      </Button>
    </div>
  );
}
