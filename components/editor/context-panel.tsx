'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ImagePlus, Lock, Trash2, Type, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RatioPicker } from '@/components/ui/ratio-picker';
import {
  ColorRow,
  Disclosure,
  NumberRow,
  PanelHeading,
  RangeRow,
  Segmented,
  StepperRow,
} from '@/components/editor/controls';
import { cn } from '@/lib/cn';
import { kindSpec } from '@/lib/campaign-kinds';
import { ratioSpec } from '@/lib/ratios';
import { CURVE_MAX, CURVE_MIN } from '@/lib/descriptor';
import { FONTS, fontSpec } from '@/lib/fonts';
import type {
  CampaignKind,
  Descriptor,
  FontFamily,
  ImageLayer,
  Layer,
  Ratio,
  TextAlign,
  TextLayer,
  VerticalAlign,
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

/** Marge haute et basse de l'alignement vertical, en proportion du cadre. */
const V_MARGIN = 0.06;

/**
 * Position verticale la plus proche d'un préréglage.
 *
 * L'alignement vertical n'est pas un réglage stocké — c'est un déplacement. On
 * se contente donc de reconnaître le préréglage vers lequel l'élément se trouve,
 * pour allumer le bon bouton.
 */
function verticalPosition(layer: Layer, ratio: Ratio): VerticalAlign {
  const spec = ratioSpec(ratio);
  const margin = Math.round(spec.height * V_MARGIN);
  const top = margin;
  const middle = Math.round((spec.height - layer.h) / 2);
  const bottom = Math.max(margin, Math.round(spec.height - layer.h - margin));
  const distance = (v: number) => Math.abs(layer.y - v);
  const best = Math.min(distance(top), distance(middle), distance(bottom));
  if (best === distance(top)) return 'top';
  if (best === distance(middle)) return 'middle';
  return 'bottom';
}

/** La courbure se lit en mot ; la valeur chiffrée reste dans le curseur. */
function curveWord(curve: number): string {
  if (curve === 0) return 'Droit';
  return curve > 0 ? `Vers le haut · ${curve}` : `Vers le bas · ${curve}`;
}

/** L'espacement des lettres se lit en mot, jamais en millièmes de cadratin. */
function spacingWord(value: number): string {
  if (value === 0) return 'Normal';
  return value < 0 ? 'Serré' : 'Large';
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
  onAlignVertical,
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
  /** Pose l'élément en haut, au centre ou en bas du cadre. */
  onAlignVertical: (where: VerticalAlign) => void;
  onToggleZone: () => void;
}) {
  const isText = layer.type === 'text';
  const spec = ratioSpec(ratio);
  const font = isText ? fontSpec(layer.font) : null;
  const vAlign: VerticalAlign = isText ? verticalPosition(layer, ratio) : 'middle';

  return (
    <div className="flex flex-col gap-4">
      <PanelHeading
        title={isText ? 'Mon texte' : 'Mon image'}
        hint={layerLabel(layer)}
      />

      {/* ---------------- Contenu du texte ---------------- */}
      {isText && (
        <>
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

          <FontPicker
            label="Police"
            value={layer.font}
            onChange={(next) => onPatch({ font: next })}
          />

          {/*
            Taille. Un texte ne se redimensionne pas comme une image : on change
            son corps, pas sa boîte — redimensionner la boîte d'un texte recompose
            la mise en page à chaque geste et fait « sauter » l'élément.
          */}
          <StepperRow
            label="Taille"
            min={16}
            max={400}
            step={4}
            value={layer.size}
            display={sizeWord(Math.round((layer.size / 400) * 100))}
            onChange={(size) => onPatch({ size })}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-gray-700">Style</span>
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton
                label="Gras"
                active={layer.weight === 'bold'}
                disabled={!font?.hasBold}
                title={font?.hasBold ? undefined : font?.note}
                onClick={() => onPatch({ weight: layer.weight === 'bold' ? 'normal' : 'bold' })}
              />
              <ToggleButton
                label="Italique"
                active={layer.style === 'italic'}
                disabled={!font?.hasItalic}
                title={font?.hasItalic ? undefined : font?.note}
                onClick={() => onPatch({ style: layer.style === 'italic' ? 'normal' : 'italic' })}
              />
            </div>
            {/* On ne laisse jamais croire qu'une variante existe : la police le dit. */}
            {font?.note && (
              <p className="text-[11px] leading-relaxed text-gray-400">{font.note}</p>
            )}
          </div>

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

          <ColorRow label="Couleur" value={layer.color} onChange={(color) => onPatch({ color })} />

          <RangeRow
            label="Opacité"
            min={0.05}
            max={1}
            step={0.05}
            value={layer.opacity}
            display={`${Math.round(layer.opacity * 100)} %`}
            onChange={(opacity) => onPatch({ opacity })}
          />
        </>
      )}

      {!isText && (
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
            <NumberRow
              label="Taille exacte"
              value={layer.size}
              min={16}
              max={400}
              onChange={(size) => onPatch({ size })}
            />

            <Segmented<VerticalAlign>
              label="Alignement vertical"
              value={vAlign}
              options={[
                { value: 'top', label: 'Haut' },
                { value: 'middle', label: 'Centre' },
                { value: 'bottom', label: 'Bas' },
              ]}
              onChange={onAlignVertical}
            />

            <RangeRow
              label="Courbure"
              min={CURVE_MIN}
              max={CURVE_MAX}
              step={1}
              value={layer.curve}
              display={curveWord(layer.curve)}
              onChange={(curve) => onPatch({ curve })}
            />

            <RangeRow
              label="Espacement des lettres"
              min={-50}
              max={400}
              step={5}
              value={layer.letterSpacing}
              display={spacingWord(layer.letterSpacing)}
              onChange={(letterSpacing) => onPatch({ letterSpacing })}
            />

            <RangeRow
              label="Interligne"
              min={0.8}
              max={2.5}
              step={0.05}
              value={layer.lineHeight}
              display={layer.lineHeight.toFixed(2)}
              onChange={(lineHeight) => onPatch({ lineHeight })}
            />
          </>
        )}

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

/* ------------------------------------------------------------------ */
/* Sélecteur de police                                                 */
/* ------------------------------------------------------------------ */

function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FontFamily;
  onChange: (value: FontFamily) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-gray-700">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex h-12 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-4 text-[13px] text-ink transition-colors hover:border-gray-400"
      >
        <span style={{ fontFamily: value }}>{value}</span>
        <ChevronDown className={cn('size-4 text-gray-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div
          id={id}
          className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-sm"
        >
          {FONTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                'flex items-center justify-between rounded-sm px-3 py-2 text-[13px] transition-colors',
                value === option.value ? 'bg-gray-100 text-ink' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              <span style={{ fontFamily: option.value }}>{option.label}</span>
              {value === option.value && <Check className="size-4 text-purple" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bouton toggle (Gras)                                                */
/* ------------------------------------------------------------------ */

function ToggleButton({
  active,
  onClick,
  label,
  disabled = false,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  /** Vrai quand la police ne possède pas la variante : on le dit, on ne ment pas. */
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={cn(
        'flex h-10 items-center justify-center rounded-md border text-[13px] font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-35',
        active
          ? 'border-ink bg-ink text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400',
      )}
    >
      {label}
    </button>
  );
}
