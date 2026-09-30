import {
  DESCRIPTOR_VERSION,
  type Descriptor,
  type ImageLayer,
  type Layer,
  type Ratio,
  type ShapeLayer,
  type TextLayer,
} from './types';
import { isRatio, ratioSpec } from './ratios';
import { isFontFamily } from './fonts';
import { RADIUS_MAX, STROKE_MAX, isShapeKind, shapeSpec } from './shapes';
import type { LayerMotion, MotionPlan, MotionPresetId } from './motion';

const MOTION_PRESETS_IDS: MotionPresetId[] = [
  'auto',
  'apparition',
  'flottement',
  'mouvement',
  'pulsation',
  'zoom',
  'elegant',
  'energique',
];

/** Interligne par défaut — c'est aussi celle de Fabric. */
export const DEFAULT_LINE_HEIGHT = 1.16;

/** Bornes de la courbure, partagées par le panneau et le rendu. */
export const CURVE_MIN = -100;
export const CURVE_MAX = 100;

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

/**
 * Un identifiant neuf, préfixé selon la nature du calque.
 *
 * Le préfixe n'est pas décoratif : il rend le descripteur lisible au diagnostic
 * — un `shp…` est une forme, un `txt…` un texte. Il vient du même générateur que
 * les fabriques de calques, donc un clone n'obtient jamais un identifiant qui
 * puisse entrer en collision avec un calque existant.
 */
export function makeLayerId(type: Layer['type'] = 'image'): string {
  const prefix = type === 'text' ? 'txt' : type === 'shape' ? 'shp' : 'img';
  return newId(prefix);
}

export function createDescriptor(ratio: Ratio = '1:1'): Descriptor {
  return {
    version: DESCRIPTOR_VERSION,
    ratio,
    background: 'transparent',
    layers: [],
    motion: null,
  };
}

/** Applique ou retire l'animation du cadre. */
export function withMotion(descriptor: Descriptor, motion: MotionPlan | null): Descriptor {
  return { ...descriptor, motion };
}

export function nextZ(layers: Layer[]): number {
  return layers.reduce((max, l) => Math.max(max, l.z ?? 0), 0) + 10;
}

/* ------------------------------------------------------------------ */
/* Zone photo — mode Cadre / mode Fond                                 */
/* ------------------------------------------------------------------ */

/**
 * Un rectangle du repère natif du ratio. C'est la seule géométrie dont le
 * parcours participant a besoin : que la photo doive couvrir tout le cadre ou
 * seulement une fenêtre, le calcul est identique.
 */
export interface PhotoZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Identifiant réservé du calque que le parcours participant ajoute pour porter
 * la photo. Réservé au sens du contrat : un descripteur qui contient ce calque
 * décrit un visuel en cours de composition, jamais un cadre publié.
 */
export const PARTICIPANT_PHOTO_ID = 'participant-photo';

/** Le cadre entier, dans le repère du ratio. */
export function frameZone(ratio: Ratio): PhotoZone {
  const spec = ratioSpec(ratio);
  return { x: 0, y: 0, w: spec.width, h: spec.height };
}

/**
 * Emprise d'un calque, rotation comprise.
 *
 * La rotation s'applique autour du centre : celui-ci ne bouge pas, seule
 * l'emprise grandit. On retient le rectangle englobant plutôt que le calque
 * pivoté, parce que c'est la seule forme pour laquelle la règle « la photo
 * couvre la zone » reste exacte.
 */
function layerBounds(layer: Layer): PhotoZone {
  const radians = (layer.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const w = layer.w * cos + layer.h * sin;
  const h = layer.w * sin + layer.h * cos;
  return {
    x: layer.x + layer.w / 2 - w / 2,
    y: layer.y + layer.h / 2 - h / 2,
    w,
    h,
  };
}

/**
 * Où la photo du participant doit apparaître.
 *
 * Sans ancre — ou si l'ancre ne désigne plus rien — c'est le cadre entier :
 * c'est le mode Cadre, et c'est aussi le repli sûr, puisqu'un cadre entier n'est
 * jamais plus petit qu'une de ses zones.
 */
export function photoZone(descriptor: Descriptor): PhotoZone {
  const anchorId = descriptor.photo_anchor;
  if (!anchorId) return frameZone(descriptor.ratio);

  const anchor = descriptor.layers.find((layer) => layer.id === anchorId);
  if (!anchor) return frameZone(descriptor.ratio);

  const bounds = layerBounds(anchor);
  if (bounds.w <= 0 || bounds.h <= 0) return frameZone(descriptor.ratio);
  return bounds;
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
    weight: opts.weight ?? 'normal',
    style: opts.style ?? 'normal',
    letterSpacing: opts.letterSpacing ?? 0,
    lineHeight: opts.lineHeight ?? DEFAULT_LINE_HEIGHT,
    curve: opts.curve ?? 0,
    x: opts.x ?? Math.round((spec.width - w) / 2),
    y: opts.y ?? Math.round(spec.height * 0.75),
    w,
    h,
    rotation: opts.rotation ?? 0,
    z: opts.z ?? 20,
    opacity: opts.opacity ?? 1,
  };
}

/**
 * Une forme posée au centre du cadre.
 *
 * La taille part de la **plus petite** dimension du cadre : un carré de 45 % du
 * côté court tient dans un Carré comme dans un Paysage ou un Vertical, sans
 * jamais déborder. La ligne échappe à la règle — sa hauteur est un trait, pas
 * une boîte.
 */
export function makeShapeLayer(
  kind: ShapeLayer['kind'],
  ratio: Ratio,
  opts: Partial<ShapeLayer> = {},
): ShapeLayer {
  const spec = ratioSpec(ratio);
  const isLine = kind === 'line';

  const side = Math.round(Math.min(spec.width, spec.height) * 0.45);
  const w = opts.w ?? (isLine ? Math.round(spec.width * 0.5) : side);
  const h = opts.h ?? (isLine ? Math.max(2, Math.round(spec.height * 0.008)) : side);

  return {
    id: opts.id ?? newId('shp'),
    type: 'shape',
    kind,
    /*
     * Toutes les formes ont une couleur, y compris la ligne — qui n'est qu'un
     * rectangle très plat. Une forme ajoutée doit se voir immédiatement : rien
     * n'est plus déroutant qu'un clic qui ne produit rien à l'écran.
     */
    fill: opts.fill ?? '#FFFFFF',
    stroke: opts.stroke ?? 'transparent',
    strokeWidth: opts.strokeWidth ?? 0,
    // Le rectangle arrondi arrive arrondi : sinon la forme n'aurait aucun sens
    // au moment précis où on la pose.
    radius: opts.radius ?? (kind === 'rounded' ? 0.18 : 0),
    x: opts.x ?? Math.round((spec.width - w) / 2),
    y: opts.y ?? Math.round((spec.height - h) / 2),
    w: Math.round(w),
    h: Math.round(h),
    rotation: opts.rotation ?? 0,
    z: opts.z ?? 30,
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

/** Nombre relu puis ramené dans ses bornes : une valeur aberrante ne passe pas. */
function clamped(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num(value, fallback)));
}

/** Relit l'animation d'un cadre. Renvoie `null` si absente ou illisible. */
export function parseMotion(input: unknown): MotionPlan | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const preset = MOTION_PRESETS_IDS.includes(raw.preset as MotionPresetId)
    ? (raw.preset as MotionPresetId)
    : 'auto';

  const rawLayers = Array.isArray(raw.layers) ? raw.layers : [];

  const layers: LayerMotion[] = rawLayers.map((entry) => {
    const l = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return {
      fadeIn: num(l.fadeIn, 0.2),
      floatY: num(l.floatY, 0),
      floatX: num(l.floatX, 0),
      pulse: num(l.pulse, 0),
      rotate: num(l.rotate, 0),
      cycles: num(l.cycles, 1),
    };
  });

  return {
    preset,
    durationMs: num(raw.durationMs, 3000),
    stagger: num(raw.stagger, 0.05),
    layers,
  };
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
        /*
         * Les deux drapeaux ne sont posés que s'ils **contredisent** le défaut.
         * Un descripteur existant, écrit avant leur arrivée, n'en porte aucun :
         * il doit continuer à se relire sans, sinon la sérialisation ajouterait
         * `"visible": true` à chaque calque d'un cadre déjà en base — du bruit
         * dans le diff, et deux représentations du même cadre.
         */
        ...(l.visible === false ? { visible: false as const } : {}),
        ...(l.locked === true ? { locked: true as const } : {}),
      };

      if (l.type === 'text') {
        const font = str(l.font, 'Inter');
        const validFont: TextLayer['font'] = isFontFamily(font) ? font : 'Inter';
        const weight = l.weight === 'bold' ? 'bold' : 'normal';
        const style: TextLayer['style'] = l.style === 'italic' ? 'italic' : 'normal';
        return {
          ...base,
          type: 'text',
          text: str(l.text, ''),
          font: validFont,
          size: num(l.size, 96),
          color: str(l.color, '#FFFFFF'),
          align: l.align === 'left' || l.align === 'right' ? l.align : 'center',
          weight,
          style,
          letterSpacing: num(l.letterSpacing, 0),
          lineHeight: num(l.lineHeight, DEFAULT_LINE_HEIGHT),
          curve: num(l.curve, 0),
        } satisfies TextLayer;
      }

      if (l.type === 'shape') {
        // Une forme inconnue (JSON écrit à la main, version future) retombe sur
        // un rectangle : le calque garde sa place et sa taille, il ne disparaît
        // pas silencieusement du cadre.
        const kind = isShapeKind(l.kind) ? l.kind : 'rect';
        const spec = shapeSpec(kind);
        return {
          ...base,
          type: 'shape',
          kind,
          fill: str(l.fill, '#FFFFFF'),
          stroke: str(l.stroke, 'transparent'),
          strokeWidth: clamped(l.strokeWidth, 0, 0, STROKE_MAX),
          radius: spec.hasRadius ? clamped(l.radius, 0, 0, RADIUS_MAX) : 0,
        } satisfies ShapeLayer;
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
    // On conserve l'identifiant tel quel, même s'il ne désigne aucun calque :
    // `photoZone()` retombe alors sur le cadre entier, et la validation signale
    // le problème au créateur plutôt que de lui faire perdre sa zone en silence.
    photo_anchor:
      typeof raw.photo_anchor === 'string' && raw.photo_anchor.length > 0
        ? raw.photo_anchor
        : undefined,
    motion: parseMotion(raw.motion),
  };
}

/** Sérialisation stable (clés ordonnées, indentation lisible pour inspection). */
export function serializeDescriptor(descriptor: Descriptor): string {
  return JSON.stringify(
    {
      version: descriptor.version,
      ratio: descriptor.ratio,
      background: descriptor.background,
      // Omis quand absent : un cadre en mode Cadre se sérialise exactement comme
      // avant l'introduction de la zone photo.
      ...(descriptor.photo_anchor ? { photo_anchor: descriptor.photo_anchor } : {}),
      ...(descriptor.motion ? { motion: descriptor.motion } : {}),
      layers: [...descriptor.layers]
        .sort((a, b) => a.z - b.z)
        .map((l) => {
          if (l.type === 'image') {
            const { id, type, src, x, y, w, h, rotation, z, opacity, visible, locked } = l;
            return {
              id,
              type,
              src,
              x,
              y,
              w,
              h,
              rotation,
              z,
              opacity,
              ...(visible === false ? { visible: false } : {}),
              ...(locked ? { locked: true } : {}),
            };
          }
          if (l.type === 'shape') {
            const { id, kind, fill, stroke, strokeWidth, radius, x, y, w, h, rotation, z, opacity, visible, locked } = l;
            return {
              id,
              type: 'shape',
              kind,
              fill,
              // Contour et arrondi au repos sont omis : une forme posée telle
              // quelle se sérialise au plus court, et reste lisible à l'œil.
              ...(stroke !== 'transparent' ? { stroke } : {}),
              ...(strokeWidth !== 0 ? { strokeWidth } : {}),
              ...(shapeSpec(kind).hasRadius && radius !== 0 ? { radius } : {}),
              x,
              y,
              w,
              h,
              rotation,
              z,
              opacity,
              ...(visible === false ? { visible: false } : {}),
              ...(locked ? { locked: true } : {}),
            };
          }
          const { id, type, text, font, size, color, align, weight, style, letterSpacing, lineHeight, curve, x, y, w, h, rotation, z, opacity, visible, locked } = l;
          return {
            id,
            type,
            text,
            font,
            size,
            color,
            align,
            weight,
            // Les réglages restés au défaut sont omis : un texte qui n'a jamais
            // été retouché se sérialise exactement comme avant leur introduction.
            ...(style !== 'normal' ? { style } : {}),
            ...(letterSpacing !== 0 ? { letterSpacing } : {}),
            ...(lineHeight !== DEFAULT_LINE_HEIGHT ? { lineHeight } : {}),
            ...(curve !== 0 ? { curve } : {}),
            x,
            y,
            w,
            h,
            rotation,
            z,
            opacity,
            ...(visible === false ? { visible: false } : {}),
            ...(locked ? { locked: true } : {}),
          };
        }),
    },
    null,
    2,
  );
}

/* ------------------------------------------------------------------ */
/* Animation réellement rejouée                                        */
/* ------------------------------------------------------------------ */

/** Un calque immobile. Sert à réserver une position dans un plan d'animation. */
export const NEUTRAL_MOTION: LayerMotion = {
  fadeIn: 0,
  floatY: 0,
  floatX: 0,
  pulse: 0,
  rotate: 0,
  cycles: 1,
};

function isNeutralMotion(motion: LayerMotion): boolean {
  return (
    motion.fadeIn === 0 &&
    motion.floatY === 0 &&
    motion.floatX === 0 &&
    motion.pulse === 0 &&
    motion.rotate === 0
  );
}

/**
 * Insère un mouvement neutre à la position `index`, après avoir complété le plan
 * jusqu'à `layerCount` entrées.
 *
 * Nécessaire parce que `sampleAt()` indexe les mouvements **par position** :
 * glisser un calque au milieu du descripteur décalerait sinon tous les suivants,
 * et le cadre ne jouerait plus la même animation. La photo du participant occupe
 * donc une position, avec un mouvement neutre — les calques du créateur gardent
 * exactement les leurs.
 */
export function insertNeutralMotion(
  motion: MotionPlan | null | undefined,
  index: number,
  layerCount: number,
): MotionPlan | null {
  if (!motion) return null;

  const layers = [...motion.layers];
  // Un plan plus court que le nombre de calques ferait « boucler » les indices :
  // on le complète d'abord, ce qui ne change rien aux positions déjà définies.
  while (layers.length < layerCount) layers.push({ ...NEUTRAL_MOTION });
  layers.splice(Math.min(index, layers.length), 0, { ...NEUTRAL_MOTION });

  return { ...motion, layers };
}

/**
 * Le plan d'animation que ce descripteur joue réellement.
 *
 * En mode Fond, la zone photo et la photo forment un bloc fixe : si l'ancre
 * bougeait, la fenêtre se déplacerait sans la photo et la laisserait dépasser.
 * Son mouvement est donc neutralisé — les autres calques continuent d'animer.
 *
 * Fonction unique, appelée par l'aperçu du créateur comme par l'export et le
 * parcours participant : c'est ce qui interdit à l'aperçu de mentir.
 */
export function effectiveMotion(descriptor: Descriptor): MotionPlan | null {
  const plan = descriptor.motion ?? null;
  if (!plan) return null;

  const layers = [...descriptor.layers].sort((a, b) => a.z - b.z);

  // Un plan sans aucun mouvement (JSON édité à la main) ferait échouer
  // l'échantillonnage : on le remplace par un plan neutre, plutôt que de laisser
  // croire à une animation qui n'existe pas.
  if (plan.layers.length === 0) {
    const count = Math.max(1, layers.length);
    return { ...plan, layers: Array.from({ length: count }, () => ({ ...NEUTRAL_MOTION })) };
  }

  if (!descriptor.photo_anchor) return plan;

  const index = layers.findIndex((layer) => layer.id === descriptor.photo_anchor);
  if (index === -1) return plan;

  const out = [...plan.layers];
  // `sampleAt()` lit `plan.layers[index % length]` : on neutralise l'entrée qui
  // pilote réellement ce calque, même si le plan est plus court que le descripteur.
  out[index % out.length] = { ...NEUTRAL_MOTION };
  return { ...plan, layers: out };
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
    if (layer.type === 'shape') {
      const noFill = layer.fill === 'transparent' || layer.fill === '';
      const noStroke = layer.stroke === 'transparent' || layer.stroke === '' || layer.strokeWidth <= 0;
      if (noFill && noStroke) {
        warnings.push(
          `La forme ${layer.id} n'a ni remplissage ni contour : elle n'apparaîtra pas.`,
        );
      }
    }
  }

  if (descriptor.motion) {
    if (descriptor.motion.durationMs <= 0) {
      errors.push("La durée de l'animation doit être positive.");
    }
    if (descriptor.motion.layers.length === 0) {
      errors.push("L'animation ne définit aucun mouvement de calque.");
    } else if (descriptor.motion.layers.length !== descriptor.layers.length) {
      warnings.push(
        "Le nombre de mouvements ne correspond pas au nombre de calques : " +
          "les calques excédentaires reprendront le premier mouvement.",
      );
    }
  }

  if (descriptor.photo_anchor) {
    const anchor = descriptor.layers.find((layer) => layer.id === descriptor.photo_anchor);

    if (!anchor) {
      warnings.push(
        "La zone photo désigne un calque qui n'existe plus : le cadre repasse en mode Cadre.",
      );
    } else {
      if (anchor.rotation % 360 !== 0) {
        warnings.push(
          "Le calque qui délimite la zone photo est pivoté : la zone retenue est son " +
            'emprise rectangulaire, pas le calque lui-même.',
        );
      }

      // La fenêtre du participant est un rectangle, par construction. Une forme
      // qui n'en est pas un donnerait une photo rectangulaire, et la forme
      // disparaîtrait dessous : mieux vaut le signaler que de le laisser
      // découvrir après publication.
      if (anchor.type === 'shape' && anchor.kind !== 'rect' && anchor.kind !== 'line') {
        warnings.push(
          `La zone photo s'appuie sur une forme « ${shapeSpec(anchor.kind).label} » : ` +
            'la photo remplira son emprise rectangulaire, pas son dessin.',
        );
      }

      if (descriptor.motion && descriptor.motion.layers.length > 0) {
        const sorted = [...descriptor.layers].sort((a, b) => a.z - b.z);
        const index = sorted.findIndex((layer) => layer.id === anchor.id);
        const entry = descriptor.motion.layers[index % descriptor.motion.layers.length];
        if (entry && !isNeutralMotion(entry)) {
          warnings.push(
            "La zone photo reste fixe pendant l'animation : le mouvement de ce calque " +
              'ne sera pas joué, sinon la photo dépasserait de sa fenêtre.',
          );
        }
      }
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
  return {
    ...descriptor,
    layers: descriptor.layers.filter((l) => l.id !== id),
    // Supprimer le calque qui délimitait la zone photo remet le cadre en mode
    // Cadre. On ne laisse pas d'ancre orpheline derrière soi.
    ...(descriptor.photo_anchor === id ? { photo_anchor: undefined } : {}),
  };
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
