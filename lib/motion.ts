/**
 * Motion Engine — animation des cadres.
 *
 * Principe produit : l'utilisateur ne règle **jamais** de keyframes, d'easing, de FPS
 * ni de durée technique. Il choisit une intention (« Flottement », « Pulsation ») ou
 * la décrit en français, et le moteur en déduit les paramètres.
 *
 * Ce module est volontairement **pur et déterministe** : il produit un `MotionPlan`
 * (des paramètres), puis `sampleAt()` donne la transformation de chaque calque à un
 * instant donné. Le même code alimente l'aperçu et l'export vidéo — donc ce que
 * l'utilisateur voit est exactement ce qui est enregistré.
 *
 * Le plan est stocké dans le descripteur de cadre (`descriptor.motion`), ce qui le
 * rend rejouable à l'identique, comme le reste du cadre.
 */

/**
 * Les cinq mouvements simples de l'éditeur.
 *
 * Sous-ensemble volontaire de `MOTION_PRESETS` : l'éditeur ne montre jamais les
 * sept d'un coup, et encore moins les réglages du moteur. Le libellé est celui
 * de l'éditeur (« Glissement »), distinct de celui du catalogue (« Mouvement »)
 * — deux contextes, une seule source : l'identifiant.
 */
export interface SimpleMotion {
  id: MotionPresetId;
  label: string;
}

export const SIMPLE_MOTIONS: SimpleMotion[] = [
  { id: 'apparition', label: 'Apparition' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'mouvement', label: 'Glissement' },
  { id: 'flottement', label: 'Flottement' },
  { id: 'energique', label: 'Dynamique' },
];

export type MotionPresetId =
  | 'auto'
  | 'apparition'
  | 'flottement'
  | 'mouvement'
  | 'pulsation'
  | 'zoom'
  | 'elegant'
  | 'energique';

export interface MotionPreset {
  id: MotionPresetId;
  label: string;
  description: string;
}

/** Presets proposés dans l'interface (§14 du design system). */
export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'auto', label: 'Automatique', description: 'Le moteur choisit pour vous.' },
  { id: 'apparition', label: 'Apparition', description: 'Le cadre se révèle en douceur.' },
  { id: 'flottement', label: 'Flottement', description: 'Léger balancement continu.' },
  { id: 'mouvement', label: 'Mouvement', description: 'Glissement latéral lent.' },
  { id: 'pulsation', label: 'Pulsation', description: 'Respiration, battement discret.' },
  { id: 'zoom', label: 'Zoom', description: 'Le cadre se rapproche puis se stabilise.' },
  { id: 'elegant', label: 'Élégant', description: 'Amplitudes faibles, rythme lent.' },
  { id: 'energique', label: 'Énergique', description: 'Amplitudes fortes, rythme rapide.' },
];

/** Comportement d'animation d'un calque. Toutes les amplitudes sont relatives. */
export interface LayerMotion {
  /** Durée d'apparition en fondu, en fraction de la durée totale (0 = pas de fondu). */
  fadeIn: number;
  /** Amplitude verticale, en fraction de la hauteur du calque. */
  floatY: number;
  /** Amplitude horizontale, en fraction de la largeur du calque. */
  floatX: number;
  /** Amplitude de mise à l'échelle (0.05 = ±5 %). */
  pulse: number;
  /** Amplitude de rotation, en degrés. */
  rotate: number;
  /** Nombre de cycles sur la durée totale. */
  cycles: number;
}

export interface MotionPlan {
  preset: MotionPresetId;
  /** Durée d'un cycle complet, en millisecondes. */
  durationMs: number;
  /** Décalage temporel entre calques, en fraction de durée. Crée un effet de vague. */
  stagger: number;
  layers: LayerMotion[];
}

export const DEFAULT_MOTION_DURATION = 3000;

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

const BASE: Record<Exclude<MotionPresetId, 'auto'>, LayerMotion> = {
  apparition: { fadeIn: 0.45, floatY: 0.012, floatX: 0, pulse: 0, rotate: 0, cycles: 1 },
  flottement: { fadeIn: 0.2, floatY: 0.03, floatX: 0.006, pulse: 0, rotate: 0, cycles: 1 },
  mouvement: { fadeIn: 0.2, floatY: 0, floatX: 0.035, pulse: 0, rotate: 0, cycles: 1 },
  pulsation: { fadeIn: 0.15, floatY: 0, floatX: 0, pulse: 0.035, rotate: 0, cycles: 2 },
  // Un seul cycle, amplitude forte : le calque grandit, revient, se stabilise.
  zoom: { fadeIn: 0.35, floatY: 0, floatX: 0, pulse: 0.1, rotate: 0, cycles: 1 },
  elegant: { fadeIn: 0.4, floatY: 0.018, floatX: 0, pulse: 0.012, rotate: 0.6, cycles: 1 },
  energique: { fadeIn: 0.12, floatY: 0.05, floatX: 0.02, pulse: 0.07, rotate: 2.4, cycles: 3 },
};

const STAGGER: Record<Exclude<MotionPresetId, 'auto'>, number> = {
  apparition: 0.08,
  flottement: 0.05,
  mouvement: 0.06,
  pulsation: 0.03,
  zoom: 0.04,
  elegant: 0.07,
  energique: 0.02,
};

/**
 * Construit un plan d'animation.
 * `auto` répartit les presets sur les calques : les fonds flottent doucement, les
 * textes apparaissent — un résultat crédible sans que l'utilisateur ait rien réglé.
 */
export function planFor(
  preset: MotionPresetId,
  layerCount: number,
  durationMs: number = DEFAULT_MOTION_DURATION,
): MotionPlan {
  const count = Math.max(1, layerCount);

  if (preset === 'auto') {
    const order: Array<Exclude<MotionPresetId, 'auto'>> = [
      'elegant',
      'flottement',
      'pulsation',
      'apparition',
    ];
    return {
      preset: 'auto',
      durationMs,
      stagger: 0.06,
      layers: Array.from({ length: count }, (_, i) => order[i % order.length]).map((id) => ({
        ...BASE[id],
      })),
    };
  }

  return {
    preset,
    durationMs,
    stagger: STAGGER[preset],
    layers: Array.from({ length: count }, () => ({ ...BASE[preset] })),
  };
}

/* ------------------------------------------------------------------ */
/* Interprétation du prompt libre                                      */
/* ------------------------------------------------------------------ */

export interface PromptInterpretation {
  plan: MotionPlan;
  /** Ce que le moteur a compris — affiché à l'utilisateur, pour rester honnête. */
  understood: string[];
  /** Vrai si aucun mot-clé n'a été reconnu : on est retombé sur l'automatique. */
  fallback: boolean;
}

interface Rule {
  /** Mots déclencheurs, en minuscules, sans accent. */
  words: string[];
  apply: (m: LayerMotion) => void;
  note: string;
}

const RULES: Rule[] = [
  {
    words: ['apparai', 'apparition', 'revele', 'fondu', 'disparai', 'fade'],
    apply: (m) => {
      m.fadeIn = 0.5;
    },
    note: 'Apparition en fondu',
  },
  {
    words: ['flotte', 'flottement', 'balance', 'oscille', 'berce'],
    apply: (m) => {
      m.floatY = 0.035;
    },
    note: 'Flottement vertical',
  },
  {
    words: ['glisse', 'defile', 'lateral', 'traverse', 'mouvement', 'bouge'],
    apply: (m) => {
      m.floatX = 0.04;
    },
    note: 'Glissement latéral',
  },
  {
    words: ['pulse', 'pulsation', 'respire', 'battement', 'coeur'],
    apply: (m) => {
      m.pulse = 0.04;
      m.cycles = Math.max(m.cycles, 2);
    },
    note: 'Pulsation',
  },
  {
    words: ['tourne', 'rotation', 'pivote', 'penche', 'incline'],
    apply: (m) => {
      m.rotate = 2.5;
    },
    note: 'Rotation douce',
  },
  {
    words: ['lent', 'doucement', 'sobre', 'subtil', 'elegant', 'calme', 'discret'],
    apply: (m) => {
      m.cycles = 1;
      m.floatY = Math.min(m.floatY, 0.025);
      m.floatX = Math.min(m.floatX, 0.02);
      m.pulse = Math.min(m.pulse, 0.02);
      m.rotate = Math.min(m.rotate, 1);
    },
    note: 'Rythme lent',
  },
  {
    words: ['rapide', 'energique', 'dynamique', 'rebond', 'vif', 'fort', 'puissant'],
    apply: (m) => {
      m.cycles = 3;
      m.floatY = Math.max(m.floatY, 0.05);
      m.pulse = Math.max(m.pulse, 0.06);
    },
    note: 'Rythme rapide',
  },
  {
    words: ['zoom', 'grossi', 'agrandi', 'scale'],
    apply: (m) => {
      m.pulse = Math.max(m.pulse, 0.05);
    },
    note: 'Effet de zoom',
  },
];

/** Retire les accents et la casse : « Flotte doucement » → « flotte doucement ». */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Traduit une phrase en français en plan d'animation.
 *
 * C'est un interpréteur par mots-clés, volontairement déterministe : il ne dépend
 * d'aucun service externe et ne coûte rien à l'exécution. Il constitue le point de
 * branchement naturel d'un vrai modèle de langage plus tard — la signature ne
 * changerait pas, seule l'implémentation du corps.
 *
 * Exemple : « Le cadre apparaît doucement puis flotte légèrement. »
 *   → fondu + flottement, rythme lent.
 */
export function interpretPrompt(
  prompt: string,
  layerCount: number,
  durationMs: number = DEFAULT_MOTION_DURATION,
): PromptInterpretation {
  const text = normalize(prompt);
  const understood: string[] = [];

  // On part d'un mouvement neutre plutôt que d'un preset : les règles s'ajoutent.
  const motion: LayerMotion = {
    fadeIn: 0.2,
    floatY: 0.01,
    floatX: 0,
    pulse: 0,
    rotate: 0,
    cycles: 1,
  };

  for (const rule of RULES) {
    if (rule.words.some((w) => text.includes(w))) {
      rule.apply(motion);
      understood.push(rule.note);
    }
  }

  const fallback = understood.length === 0;
  if (fallback) {
    return { plan: planFor('auto', layerCount, durationMs), understood: ['Automatique'], fallback };
  }

  // Une durée plus longue quand l'utilisateur demande de la lenteur.
  const slow = understood.includes('Rythme lent');
  const fast = understood.includes('Rythme rapide');
  const duration = slow ? 4200 : fast ? 2200 : durationMs;

  return {
    plan: {
      preset: 'auto',
      durationMs: duration,
      stagger: 0.05,
      layers: Array.from({ length: Math.max(1, layerCount) }, () => ({ ...motion })),
    },
    understood,
    fallback,
  };
}

/* ------------------------------------------------------------------ */
/* Échantillonnage                                                     */
/* ------------------------------------------------------------------ */

export interface LayerTransform {
  opacity: number;
  dx: number;
  dy: number;
  scale: number;
  /** Degrés. */
  rotation: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Transformation d'un calque à l'instant `tMs`.
 * `width`/`height` sont les dimensions du calque, pour que les amplitudes soient
 * proportionnelles à sa taille quel que soit le format du cadre.
 */
export function sampleAt(
  plan: MotionPlan,
  layerIndex: number,
  tMs: number,
  width: number,
  height: number,
): LayerTransform {
  const layer = plan.layers[layerIndex % plan.layers.length] ?? plan.layers[0];
  const duration = Math.max(1, plan.durationMs);
  const local = (tMs % duration) / duration;
  const phase = (local + layerIndex * plan.stagger) * Math.PI * 2 * layer.cycles;

  const fade =
    layer.fadeIn > 0
      ? Math.min(1, easeOutCubic(Math.min(1, tMs / (duration * layer.fadeIn))))
      : 1;

  return {
    opacity: fade,
    dx: Math.sin(phase) * layer.floatX * width,
    dy: Math.cos(phase) * layer.floatY * height,
    scale: 1 + Math.sin(phase) * layer.pulse,
    rotation: Math.sin(phase) * layer.rotate,
  };
}
