'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutTemplate,
  Lock,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
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
import { PLANS, PREMIUM_MODULES, hasFeature, type PlanId } from '@/lib/plans';
import { PlanBadge } from '@/components/plans/plan-card';
import {
  RADIUS_MAX,
  SHAPES,
  STROKE_DEFAULT_COLOR,
  STROKE_STEPS,
  shapeSpec,
  strokeStepLabel,
} from '@/lib/shapes';
import type {
  CampaignKind,
  Descriptor,
  FontFamily,
  ImageLayer,
  Layer,
  Ratio,
  ShapeKind,
  ShapeLayer,
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

export type LayerPatch = Partial<Omit<TextLayer, 'type'>> &
  Partial<Omit<ImageLayer, 'type'>> &
  Partial<Omit<ShapeLayer, 'type'>> & {
    visible?: boolean;
    locked?: boolean;
  };

/* ------------------------------------------------------------------ */
/* Vocabulaire                                                         */
/* ------------------------------------------------------------------ */

function layerLabel(layer: Layer): string {
  if (layer.type === 'text') {
    const text = layer.text.trim();
    return text.length > 0 ? `« ${text.slice(0, 24)} »` : 'Texte';
  }
  if (layer.type === 'shape') return shapeSpec(layer.kind).label;
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
  plan,
  onAddImage,
  onAddText,
  onAddShape,
  onChangeRatio,
  onOpenTemplates,
  busy,
  locked,
  onToggleLock,
}: {
  descriptor: Descriptor;
  kind: CampaignKind;
  /** Plafond imposé par la formule. `null` = illimité. */
  maxLayers: number | null;
  /** Formule du compte : décide de l'accès aux modèles de cadres. */
  plan: PlanId | string | null;
  onAddImage: () => void;
  onAddText: () => void;
  onAddShape: (kind: ShapeKind) => void;
  onChangeRatio: (ratio: Ratio) => void;
  onOpenTemplates?: () => void;
  busy: boolean;
  /** La zone du participant est verrouillée : elle ne bouge plus par accident. */
  locked: boolean;
  onToggleLock: () => void;
}) {
  const spec = kindSpec(kind);
  const count = descriptor.layers.length;
  const limitReached = maxLayers !== null && count >= maxLayers;

  /*
   * Les modèles de cadres sont un module premium (`templates_premium`). La
   * règle n'est pas recopiée ici : elle est lue depuis `lib/plans.ts`, comme la
   * limite de calques. Ajouter une formule demain ne demande aucune retouche.
   */
  const templatesUnlocked = hasFeature(plan, 'templates_premium');
  const templatesFrom =
    PREMIUM_MODULES.find((m) => m.feature === 'templates_premium')?.availableFrom ?? 'creator';
  const templatesPlan = PLANS[templatesFrom];

  return (
    <div className="flex flex-col gap-5">
      <PanelHeading title="Mon cadre" hint={spec.detail} />

      {onOpenTemplates && (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={templatesUnlocked ? onOpenTemplates : undefined}
            disabled={!templatesUnlocked}
            aria-disabled={!templatesUnlocked}
            title={
              templatesUnlocked
                ? undefined
                : 'Les modèles de cadres sont réservés aux formules payantes.'
            }
            className="w-full flex items-center justify-center gap-2"
          >
            {templatesUnlocked ? (
              <LayoutTemplate className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
            ) : (
              <Lock className="size-4 text-gray-400" strokeWidth={1.75} aria-hidden />
            )}
            Choisir un modèle…
          </Button>
          {/*
            On ne cache pas le module : il reste visible avec la formule qui le
            débloque. Un bouton verrouillé et muet ferait croire à une panne.
          */}
          {!templatesUnlocked && (
            <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-gray-500">
              <PlanBadge plan={templatesFrom} />
              <span>{templatesPlan.name}</span>
              <a href="/tarifs" className="underline underline-offset-4 hover:text-ink">
                Voir les formules
              </a>
            </p>
          )}
        </div>
      )}

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

        {/*
          Les formes sont posées ici, avec les autres ajouts : c'est le même
          geste. On ne demande jamais de choisir une couleur ou une épaisseur
          avant d'avoir posé la forme — on la pose, puis on la règle.
        */}
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-[11px] text-gray-500">Ou une forme</span>
          <ShapePalette onPick={onAddShape} disabled={busy || limitReached} />
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
  onDuplicate,
  onOrder,
  onAlignHorizontal,
  onAlignVertical,
  onToggleZone,
  onToggleLock,
  onToggleVisible,
}: {
  layer: Layer;
  ratio: Ratio;
  /** Ce calque délimite la zone photo du parcours participant. */
  isZone: boolean;
  /** Le calque qui délimite déjà la zone, s'il s'agit d'un autre. */
  otherZone: Layer | null;
  onPatch: (patch: LayerPatch) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOrder: (direction: 'front' | 'back' | 'front-most' | 'back-most') => void;
  onAlignHorizontal: (where: 'left' | 'center' | 'right') => void;
  /** Pose l'élément en haut, au centre ou en bas du cadre. */
  onAlignVertical: (where: VerticalAlign) => void;
  onToggleZone: () => void;
  onToggleLock: () => void;
  onToggleVisible: () => void;
}) {
  const isText = layer.type === 'text';
  const isShape = layer.type === 'shape';
  /** Forme dont l'emprise est déjà un rectangle : la fenêtre photo lui est fidèle. */
  const isPlainBox =
    layer.type === 'shape' && (layer.kind === 'rect' || layer.kind === 'line');
  const spec = ratioSpec(ratio);
  const font = isText ? fontSpec(layer.font) : null;

  return (
    <div className="flex flex-col gap-4">
      <PanelHeading
        title={isText ? 'Mon texte' : isShape ? 'Ma forme' : 'Mon image'}
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

      {/* ---------------- Réglages de la forme ---------------- */}
      {isShape && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-gray-700">Forme</span>
            <ShapePalette value={layer.kind} onPick={(next) => onPatch({ kind: next })} />
          </div>

          <ColorRow
            label="Couleur"
            value={layer.fill}
            onChange={(fill) => onPatch({ fill })}
            // Une forme peut être évidée : c'est ce qui permet de faire un
            // simple liseré, ou de découper une fenêtre dans un aplat.
            allowTransparent
          />

          {/*
            Le contour se règle d'abord en épaisseur, en mots. On ne demande pas
            de choisir une couleur pour un contour de zéro pixel : la teinte
            n'apparaît qu'au moment où elle sert, et se pose alors d'elle-même
            plutôt que de laisser l'utilisateur devant une forme inchangée.
          */}
          <Segmented<string>
            label="Contour"
            value={strokeStepLabel(layer.strokeWidth)}
            options={STROKE_STEPS.map((step) => ({ value: step.label, label: step.label }))}
            onChange={(label) => {
              const step = STROKE_STEPS.find((candidate) => candidate.label === label);
              if (!step) return;
              onPatch({
                strokeWidth: step.value,
                ...(step.value > 0 && layer.stroke === 'transparent'
                  ? { stroke: STROKE_DEFAULT_COLOR }
                  : {}),
              });
            }}
          />

          {layer.strokeWidth > 0 && (
            <ColorRow
              label="Couleur du contour"
              value={layer.stroke === 'transparent' ? STROKE_DEFAULT_COLOR : layer.stroke}
              onChange={(stroke) => onPatch({ stroke })}
              // Un contour « évidé » ne veut rien dire : c'est l'épaisseur qui
              // décide s'il existe. Le réglage est déjà au-dessus.
              allowGradient={false}
            />
          )}

          {shapeSpec(layer.kind).hasRadius && (
            <RangeRow
              label="Arrondi"
              min={0}
              max={RADIUS_MAX}
              step={0.01}
              value={layer.radius}
              display={`${Math.round(layer.radius * 100)} %`}
              onChange={(radius) => onPatch({ radius })}
            />
          )}
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

      {/* ---------------- Alignement & Disposition ---------------- */}
      <div className="flex flex-col gap-2.5 rounded-md border border-gray-200 bg-gray-50/70 p-3">
        <span className="text-[12px] font-semibold text-gray-700">Alignement & Disposition</span>

        {/* Alignement Horizontal */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-gray-500">Horizontal</span>
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAlignHorizontal('left')}
              title="Aligner à gauche du cadre"
              className="text-[11px] h-8 bg-white border border-gray-200"
            >
              Gauche
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAlignHorizontal('center')}
              title="Centrer horizontalement"
              className="text-[11px] h-8 bg-white border border-gray-200"
            >
              Centre
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAlignHorizontal('right')}
              title="Aligner à droite du cadre"
              className="text-[11px] h-8 bg-white border border-gray-200"
            >
              Droite
            </Button>
          </div>
        </div>

        {/* Alignement Vertical */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-gray-500">Vertical</span>
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAlignVertical('top')}
              title="Aligner en haut du cadre"
              className="text-[11px] h-8 bg-white border border-gray-200"
            >
              Haut
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAlignVertical('middle')}
              title="Centrer verticalement"
              className="text-[11px] h-8 bg-white border border-gray-200"
            >
              Milieu
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAlignVertical('bottom')}
              title="Aligner en bas du cadre"
              className="text-[11px] h-8 bg-white border border-gray-200"
            >
              Bas
            </Button>
          </div>
        </div>

        {/* Ordre de superposition */}
        <div className="flex flex-col gap-1 pt-1 border-t border-gray-200/60">
          <span className="text-[11px] text-gray-500">Superposition (pile)</span>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOrder('front-most')}
              title="Placer tout au premier plan"
              className="text-[11px] h-8 bg-white border border-gray-200"
            >
              Tout devant
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOrder('front')}
              title="Avancer d'un cran"
              className="text-[11px] h-8 bg-white border border-gray-200"
            >
              Devant
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOrder('back')}
              title="Reculer d'un cran"
              className="text-[11px] h-8 bg-white border border-gray-200"
            >
              Derrière
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOrder('back-most')}
              title="Placer tout à l'arrière-plan"
              className="text-[11px] h-8 bg-white border border-gray-200"
            >
              Tout derrière
            </Button>
          </div>
        </div>
      </div>

      {/* ---------------- Actions rapides de calque ---------------- */}
      <div className="grid grid-cols-3 gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDuplicate}
          title="Dupliquer l'élément (Ctrl+D)"
          className="h-9 gap-1.5 text-[11px] border border-gray-200 bg-white"
        >
          <Copy className="size-3.5 text-gray-500" />
          Dupliquer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleLock}
          title={layer.locked ? 'Déverrouiller' : 'Verrouiller'}
          className={cn(
            'h-9 gap-1.5 text-[11px] border border-gray-200 bg-white',
            layer.locked && 'border-purple text-purple font-semibold bg-purple/5',
          )}
        >
          {layer.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5 text-gray-500" />}
          {layer.locked ? 'Verrouillé' : 'Verrouiller'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleVisible}
          title={layer.visible === false ? 'Afficher le calque' : 'Masquer le calque'}
          className={cn(
            'h-9 gap-1.5 text-[11px] border border-gray-200 bg-white',
            layer.visible === false && 'opacity-60 text-gray-400',
          )}
        >
          {layer.visible === false ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5 text-gray-500" />}
          {layer.visible === false ? 'Masqué' : 'Visible'}
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

        {/*
          Une fenêtre photo est toujours rectangulaire : on le dit plutôt que de
          laisser croire que la photo épousera le dessin de la forme — un cercle
          posé en zone donnerait un cadrage carré, et la forme disparaîtrait
          sous la photo.
        */}
        {isShape && !isPlainBox && (
          <p className="text-[11px] leading-relaxed text-gray-400">
            La photo sera posée dans le rectangle qui entoure la forme, pas dans son dessin.
          </p>
        )}

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

            <RangeRow
              label="Courbure du texte"
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
        Supprimer l'élément
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Palette de formes                                                   */
/* ------------------------------------------------------------------ */

/**
 * Les sept formes, en boutons.
 *
 * Chaque bouton **dessine** la forme qu'il pose : le tracé vient de
 * `lib/shapes.ts`, la même liste qui alimente le rendu. On ne montre donc jamais
 * une icône qui ne correspondrait pas exactement au résultat.
 */
function ShapePalette({
  value,
  onPick,
  disabled = false,
}: {
  /** Forme courante, pour allumer le bouton correspondant. */
  value?: ShapeKind;
  onPick: (kind: ShapeKind) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {SHAPES.map((shape) => (
        <button
          key={shape.value}
          type="button"
          title={shape.label}
          aria-label={shape.label}
          aria-pressed={value === shape.value}
          disabled={disabled}
          onClick={() => onPick(shape.value)}
          className={cn(
            'flex h-11 items-center justify-center rounded-md border transition-colors duration-150',
            'disabled:pointer-events-none disabled:opacity-35',
            value === shape.value
              ? 'border-ink bg-ink text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:border-ink hover:text-ink',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path d={shape.preview} fill="currentColor" />
          </svg>
        </button>
      ))}
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
