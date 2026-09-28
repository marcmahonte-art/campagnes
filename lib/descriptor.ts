import {
  DESCRIPTOR_VERSION,
  type Descriptor,
  type ImageLayer,
  type Layer,
  type Ratio,
  type TextLayer,
} from './types';
import { isRatio, ratioSpec } from './ratios';

/**
 * Le descripteur est le contrat entre le créateur et le futur rendu participant.
 * Ce module est le SEUL endroit qui l'écrit ou le relit.
 *
 * Invariant : { version, ratio, background, layers[] } — exactement la forme
 * vérifiée par la contrainte `frames_descriptor_shape` en base.
 */

let counter = 0;

function newId(prefix = 'l'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createDescriptor(ratio: Ratio = '1:1'): Descriptor {
  return {
    version: DESCRIPTOR_VERSION,
    ratio,
    background: 'transparent',
    layers: [],
  };
}

export function nextZ(layers: Layer[]): number {
  return layers.reduce((max, l) => Math.max(max, l.z ?? 0), 0) + 10;
}

/* ------------------------------------------------------------------ */
/* Fabriques de calques                                                */
/* ------------------------------------------------------------------ */

export function makeImageLayer(
  src: string,
  ratio: Ratio,
  opts: Partial<ImageLayer> = {},
): ImageLayer {
  const spec = ratioSpec(ratio);
  // On centre par défaut et on ne dépasse pas 80 % de la plus petite dimension.
  const maxW = spec.width * 0.8;
  const maxH = spec.height * 0.8;
  const w = opts.w ?? maxW;
  const h = opts.h ?? maxH;
  return {
    id: opts.id ?? newId('img'),
    type: 'image',
    src,
    label: opts.label,
    x: opts.x ?? Math.round((spec.width - w) / 2),
    y: opts.y ?? Math.round((spec.height - h) / 2),
    w: Math.round(w),
    h: Math.round(h),
    rotation: opts.rotation ?? 0,
    z: opts.z ?? 10,
    opacity: opts.opacity ?? 1,
  };
}

export function makeTextLayer(
  text: string,
  ratio: Ratio,
  opts: Partial<TextLayer> = {},
): TextLayer {
  const spec = ratioSpec(ratio);
  const w = opts.w ?? Math.round(spec.width * 0.8);
  const h = opts.h ?? Math.round((opts.size ?? 96) * 1.3);
  return {
    id: opts.id ?? newId('txt'),
    type: 'text',
    text,
    font: opts.font ?? 'Inter',
    size: opts.size ?? 96,
    color: opts.color ?? '#FFFFFF',
    align: opts.align ?? 'center',
    x: opts.x ?? Math.round((spec.width - w) / 2),
    y: opts.y ?? Math.round(spec.height * 0.75),
    w,
    h,
    rotation: opts.rotation ?? 0,
    z: opts.z ?? 20,
    opacity: opts.opacity ?? 1,
  };
}

/* ------------------------------------------------------------------ */
/* Lecture tolérante                                                   */
/* ------------------------------------------------------------------ */

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/**
 * Relit un descripteur éventuellement incomplet (ancienne version, JSON édité à la
 * main, donnée revenue de la base). Ne lève jamais : renvoie toujours un descripteur
 * utilisable. Le ratio de repli est `1:1`.
 */
export function parseDescriptor(input: unknown): Descriptor {
  if (!input || typeof input !== 'object') return createDescriptor('1:1');

  const raw = input as Record<string, unknown>;
  const ratio: Ratio = isRatio(raw.ratio) ? raw.ratio : '1:1';
  const rawLayers = Array.isArray(raw.layers) ? raw.layers : [];

  const layers: Layer[] = rawLayers
    .map((entry, index): Layer | null => {
      if (!entry || typeof entry !== 'object') return null;
      const l = entry as Record<string, unknown>;
      const base = {
        id: str(l.id, `l${index}`),
        x: num(l.x, 0),
        y: num(l.y, 0),
        w: num(l.w, 100),
        h: num(l.h, 100),
        rotation: num(l.rotation, 0),
        z: num(l.z, (index + 1) * 10),
        opacity: num(l.opacity, 1),
      };

      if (l.type === 'text') {
        return {
          ...base,
          type: 'text',
          text: str(l.text, ''),
          font: str(l.font, 'Inter'),
          size: num(l.size, 96),
          color: str(l.color, '#FFFFFF'),
          align: l.align === 'left' || l.align === 'right' ? l.align : 'center',
        } satisfies TextLayer;
      }

      if (l.type === 'image') {
        return {
          ...base,
          type: 'image',
          src: str(l.src, ''),
          label: typeof l.label === 'string' ? l.label : undefined,
        } satisfies ImageLayer;
      }

      return null;
    })
    .filter((l): l is Layer => l !== null)
    .sort((a, b) => a.z - b.z);

  return {
    version: num(raw.version, DESCRIPTOR_VERSION),
    ratio,
    background: str(raw.background, 'transparent'),
    layers,
  };
}

/** Sérialisation stable (clés ordonnées, indentation lisible pour inspection). */
export function serializeDescriptor(descriptor: Descriptor): string {
  return JSON.stringify(
    {
      version: descriptor.version,
      ratio: descriptor.ratio,
      background: descriptor.background,
      layers: [...descriptor.layers]
        .sort((a, b) => a.z - b.z)
        .map((l) => {
          if (l.type === 'image') {
            const { id, type, src, x, y, w, h, rotation, z, opacity } = l;
            return { id, type, src, x, y, w, h, rotation, z, opacity };
          }
          const { id, type, text, font, size, color, align, x, y, w, h, rotation, z, opacity } = l;
          return { id, type, text, font, size, color, align, x, y, w, h, rotation, z, opacity };
        }),
    },
    null,
    2,
  );
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateDescriptor(descriptor: Descriptor): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Number.isInteger(descriptor.version) || descriptor.version < 1) {
    errors.push('La version du descripteur doit être un entier ≥ 1.');
  }
  if (!isRatio(descriptor.ratio)) {
    errors.push('Le ratio doit être 1:1, 16:9 ou 9:16.');
  }
  if (descriptor.layers.length === 0) {
    warnings.push('Le cadre ne contient aucun calque.');
  }

  const ids = new Set<string>();
  for (const layer of descriptor.layers) {
    if (ids.has(layer.id)) errors.push(`Identifiant de calque dupliqué : ${layer.id}.`);
    ids.add(layer.id);

    if (layer.w <= 0 || layer.h <= 0) {
      errors.push(`Le calque ${layer.id} a une taille nulle ou négative.`);
    }
    if (layer.opacity < 0 || layer.opacity > 1) {
      errors.push(`L'opacité du calque ${layer.id} doit être comprise entre 0 et 1.`);
    }
    if (layer.type === 'image' && !layer.src) {
      errors.push(`Le calque image ${layer.id} n'a pas de source.`);
    }
    if (layer.type === 'text' && layer.text.trim() === '') {
      warnings.push(`Le calque texte ${layer.id} est vide.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Mutations immuables                                                 */
/* ------------------------------------------------------------------ */

export function addLayer(descriptor: Descriptor, layer: Layer): Descriptor {
  return { ...descriptor, layers: [...descriptor.layers, layer] };
}

export function updateLayer(
  descriptor: Descriptor,
  id: string,
  patch: Partial<Layer>,
): Descriptor {
  return {
    ...descriptor,
    layers: descriptor.layers.map((l) =>
      l.id === id ? ({ ...l, ...patch } as Layer) : l,
    ),
  };
}

export function removeLayer(descriptor: Descriptor, id: string): Descriptor {
  return { ...descriptor, layers: descriptor.layers.filter((l) => l.id !== id) };
}

/** Ordre des calques : « devant » / « derrière » sans exposer de notion de z-index. */
export function moveLayer(descriptor: Descriptor, id: string, direction: 'front' | 'back'): Descriptor {
  const sorted = [...descriptor.layers].sort((a, b) => a.z - b.z);
  const index = sorted.findIndex((l) => l.id === id);
  if (index === -1) return descriptor;

  const target = direction === 'front' ? index + 1 : index - 1;
  if (target < 0 || target >= sorted.length) return descriptor;

  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  return {
    ...descriptor,
    layers: sorted.map((l, i) => ({ ...l, z: (i + 1) * 10 })),
  };
}

export function withRatio(descriptor: Descriptor, ratio: Ratio): Descriptor {
  return { ...descriptor, ratio };
}
