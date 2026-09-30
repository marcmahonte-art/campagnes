import type { CampaignKind, Descriptor, Layer, Ratio, ShapeLayer, TextLayer } from './types';
import { ratioSpec } from './ratios';

export interface FrameTemplate {
  id: string;
  title: string;
  description: string;
  kind: CampaignKind;
  category: 'all' | 'photo_frame' | 'video_frame' | 'background_frame';
  ratio: Ratio;
  tags: string[];
  descriptor: Descriptor;
}

export const TEMPLATES: FrameTemplate[] = [
  {
    id: 'rentree-scolaire',
    title: 'Rentrée Scolaire & Campus',
    description: 'Bandeau bas épuré avec titre fort et sous-titre pour rentrée ou promotion.',
    kind: 'photo_frame',
    category: 'photo_frame',
    ratio: '1:1',
    tags: ['école', 'campus', 'événement', 'carré'],
    descriptor: {
      version: 1,
      ratio: '1:1',
      background: 'transparent',
      layers: [
        {
          id: 'tpl-bg-bar',
          type: 'shape',
          kind: 'rect',
          fill: '#000000',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 0,
          y: 840,
          w: 1080,
          h: 240,
          rotation: 0,
          z: 10,
          opacity: 0.92,
        },
        {
          id: 'tpl-line',
          type: 'shape',
          kind: 'line',
          fill: '#FFD93D',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 90,
          y: 840,
          w: 900,
          h: 6,
          rotation: 0,
          z: 20,
          opacity: 1,
        },
        {
          id: 'tpl-title',
          type: 'text',
          text: 'Promotion 2026',
          font: 'Montserrat',
          size: 76,
          color: '#FFFFFF',
          align: 'center',
          weight: 'bold',
          style: 'normal',
          letterSpacing: 30,
          lineHeight: 1.16,
          curve: 0,
          x: 90,
          y: 880,
          w: 900,
          h: 90,
          rotation: 0,
          z: 30,
          opacity: 1,
        },
        {
          id: 'tpl-subtitle',
          type: 'text',
          text: 'Fiers de notre parcours · Ensemble',
          font: 'Inter',
          size: 34,
          color: '#E5E7EB',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 10,
          lineHeight: 1.16,
          curve: 0,
          x: 90,
          y: 975,
          w: 900,
          h: 46,
          rotation: 0,
          z: 40,
          opacity: 0.95,
        },
      ],
    },
  },
  {
    id: 'festival-vibrant',
    title: 'Festival & Concert (Story)',
    description: 'Format vertical 9:16 avec typographie d’impact et pastille dynamique.',
    kind: 'photo_frame',
    category: 'photo_frame',
    ratio: '9:16',
    tags: ['musique', 'festival', 'story', 'impact'],
    descriptor: {
      version: 1,
      ratio: '9:16',
      background: 'transparent',
      layers: [
        {
          id: 'tpl-top-badge',
          type: 'shape',
          kind: 'rounded',
          fill: '#7B61FF',
          stroke: '#FFFFFF',
          strokeWidth: 0.005,
          radius: 0.5,
          x: 340,
          y: 90,
          w: 400,
          h: 80,
          rotation: 0,
          z: 10,
          opacity: 0.95,
        },
        {
          id: 'tpl-badge-txt',
          type: 'text',
          text: 'ÉDITION 2026',
          font: 'Bebas Neue',
          size: 48,
          color: '#FFFFFF',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 40,
          lineHeight: 1.1,
          curve: 0,
          x: 340,
          y: 105,
          w: 400,
          h: 55,
          rotation: 0,
          z: 20,
          opacity: 1,
        },
        {
          id: 'tpl-bottom-card',
          type: 'shape',
          kind: 'rounded',
          fill: '#000000',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0.08,
          x: 60,
          y: 1600,
          w: 960,
          h: 240,
          rotation: 0,
          z: 15,
          opacity: 0.9,
        },
        {
          id: 'tpl-fest-title',
          type: 'text',
          text: 'FESTIVAL DES ARTS',
          font: 'Bebas Neue',
          size: 110,
          color: '#FFD93D',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 25,
          lineHeight: 1.1,
          curve: 0,
          x: 80,
          y: 1625,
          w: 920,
          h: 120,
          rotation: 0,
          z: 30,
          opacity: 1,
        },
        {
          id: 'tpl-fest-loc',
          type: 'text',
          text: 'Grand Palais · Entrée Libre',
          font: 'Inter',
          size: 32,
          color: '#FFFFFF',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 15,
          lineHeight: 1.16,
          curve: 0,
          x: 80,
          y: 1745,
          w: 920,
          h: 40,
          rotation: 0,
          z: 40,
          opacity: 0.9,
        },
      ],
    },
  },
  {
    id: 'gala-prestige',
    title: 'Gala & Élégance Prestige',
    description: 'Ambiance dorée et raffinée, cadre fin et typographie serif.',
    kind: 'photo_frame',
    category: 'photo_frame',
    ratio: '1:1',
    tags: ['gala', 'luxe', 'prestige', 'serif'],
    descriptor: {
      version: 1,
      ratio: '1:1',
      background: 'transparent',
      layers: [
        {
          id: 'tpl-border',
          type: 'shape',
          kind: 'rect',
          fill: 'transparent',
          stroke: '#FFD93D',
          strokeWidth: 0.012,
          radius: 0,
          x: 40,
          y: 40,
          w: 1000,
          h: 1000,
          rotation: 0,
          z: 10,
          opacity: 0.9,
        },
        {
          id: 'tpl-star-top',
          type: 'shape',
          kind: 'star',
          fill: '#FFD93D',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 510,
          y: 60,
          w: 60,
          h: 60,
          rotation: 0,
          z: 20,
          opacity: 1,
        },
        {
          id: 'tpl-gala-head',
          type: 'text',
          text: 'Gala Annuel de Bienfaisance',
          font: 'Playfair Display',
          size: 64,
          color: '#FFFFFF',
          align: 'center',
          weight: 'bold',
          style: 'italic',
          letterSpacing: 20,
          lineHeight: 1.2,
          curve: 0,
          x: 80,
          y: 890,
          w: 920,
          h: 80,
          rotation: 0,
          z: 30,
          opacity: 1,
        },
        {
          id: 'tpl-gala-sub',
          type: 'text',
          text: 'Une soirée d’exception · 2026',
          font: 'Lora',
          size: 30,
          color: '#FFD93D',
          align: 'center',
          weight: 'normal',
          style: 'italic',
          letterSpacing: 15,
          lineHeight: 1.16,
          curve: 0,
          x: 80,
          y: 975,
          w: 920,
          h: 40,
          rotation: 0,
          z: 40,
          opacity: 0.9,
        },
      ],
    },
  },
  {
    id: 'badge-participant',
    title: 'Badge Participant Officiel',
    description: 'Mode photo sur fond : fenêtre photo au centre et cartouche nominatif en bas.',
    kind: 'background_frame',
    category: 'background_frame',
    ratio: '1:1',
    tags: ['badge', 'participant', 'fond', 'association'],
    descriptor: {
      version: 1,
      ratio: '1:1',
      background: 'transparent',
      photo_anchor: 'zone-photo-anchor',
      layers: [
        {
          id: 'tpl-badge-bg',
          type: 'shape',
          kind: 'rounded',
          fill: '#111827',
          stroke: '#7B61FF',
          strokeWidth: 0.01,
          radius: 0.06,
          x: 60,
          y: 60,
          w: 960,
          h: 960,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        {
          id: 'zone-photo-anchor',
          type: 'image',
          src:
            'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="660"><rect width="100%" height="100%" fill="#1F2937" rx="16"/></svg>`,
            ),
          label: 'Zone photo participant',
          x: 160,
          y: 140,
          w: 760,
          h: 660,
          rotation: 0,
          z: 20,
          opacity: 1,
        },
        {
          id: 'tpl-badge-title',
          type: 'text',
          text: 'PARTICIPANT OFFICIEL',
          font: 'Montserrat',
          size: 42,
          color: '#FFD93D',
          align: 'center',
          weight: 'bold',
          style: 'normal',
          letterSpacing: 40,
          lineHeight: 1.16,
          curve: 0,
          x: 160,
          y: 830,
          w: 760,
          h: 55,
          rotation: 0,
          z: 30,
          opacity: 1,
        },
        {
          id: 'tpl-badge-sub',
          type: 'text',
          text: 'Sommet Digital Francophone',
          font: 'Inter',
          size: 30,
          color: '#E5E7EB',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 10,
          lineHeight: 1.16,
          curve: 0,
          x: 160,
          y: 890,
          w: 760,
          h: 40,
          rotation: 0,
          z: 40,
          opacity: 0.95,
        },
      ],
    },
  },
  {
    id: 'motion-pulse-story',
    title: 'Story Pulsation Vidéo',
    description: 'Cadre vidéo animé avec motion preset pulsation et pastilles vibrantes.',
    kind: 'video_frame',
    category: 'video_frame',
    ratio: '9:16',
    tags: ['vidéo', 'animation', 'story', 'dynamique'],
    descriptor: {
      version: 1,
      ratio: '9:16',
      background: 'transparent',
      motion: {
        preset: 'pulsation',
        durationMs: 3000,
        stagger: 0.08,
        /*
         * Un mouvement par calque, dans l'ordre de la pile : c'est ainsi que
         * `sampleAt()` indexe. En donner moins ferait animer les calques
         * excédentaires avec le premier — et le contrôle de validation le
         * signale. Le décor reste fixe, la pastille bat, le titre se pose.
         */
        layers: [
          { fadeIn: 0.2, floatY: 0, floatX: 0, pulse: 0, rotate: 0, cycles: 0 },
          { fadeIn: 0.3, floatY: 0, floatX: 0, pulse: 0.05, rotate: 0, cycles: 2 },
          { fadeIn: 0.4, floatY: 0.02, floatX: 0, pulse: 0, rotate: 0, cycles: 0 },
          { fadeIn: 0.5, floatY: 0.03, floatX: 0, pulse: 0, rotate: 0.4, cycles: 1 },
        ],
      },
      layers: [
        {
          id: 'tpl-motion-circle',
          type: 'shape',
          kind: 'circle',
          fill: '#FF6B6B',
          stroke: '#FFFFFF',
          strokeWidth: 0.008,
          radius: 0,
          x: 820,
          y: 120,
          w: 160,
          h: 160,
          rotation: 0,
          z: 10,
          opacity: 0.9,
        },
        {
          id: 'tpl-live-txt',
          type: 'text',
          text: 'LIVE',
          font: 'Bebas Neue',
          size: 64,
          color: '#FFFFFF',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 20,
          lineHeight: 1.1,
          curve: 0,
          x: 820,
          y: 170,
          w: 160,
          h: 65,
          rotation: 0,
          z: 20,
          opacity: 1,
        },
        {
          id: 'tpl-motion-banner',
          type: 'shape',
          kind: 'rounded',
          fill: '#7B61FF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0.1,
          x: 70,
          y: 1660,
          w: 940,
          h: 180,
          rotation: 0,
          z: 30,
          opacity: 0.95,
        },
        {
          id: 'tpl-motion-title',
          type: 'text',
          text: 'JE SUIS DE LA PARTIE !',
          font: 'Bebas Neue',
          size: 88,
          color: '#FFFFFF',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 30,
          lineHeight: 1.1,
          curve: 0,
          x: 90,
          y: 1700,
          w: 900,
          h: 95,
          rotation: 0,
          z: 40,
          opacity: 1,
        },
      ],
    },
  },
  {
    id: 'campagne-solidaire',
    title: 'Cause & Solidarité',
    description: 'Texte courbé au-dessus et cartouche d’engagement en bas.',
    kind: 'photo_frame',
    category: 'photo_frame',
    ratio: '1:1',
    tags: ['association', 'solidarité', 'cause', 'courbe'],
    descriptor: {
      version: 1,
      ratio: '1:1',
      background: 'transparent',
      layers: [
        {
          id: 'tpl-curved-title',
          type: 'text',
          text: 'TOUS MOBILISÉS POUR LA CAUSE',
          font: 'Montserrat',
          size: 60,
          color: '#FF6B6B',
          align: 'center',
          weight: 'bold',
          style: 'normal',
          letterSpacing: 25,
          lineHeight: 1.16,
          curve: 35,
          x: 90,
          y: 70,
          w: 900,
          h: 100,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        {
          id: 'tpl-solidarity-bar',
          type: 'shape',
          kind: 'rounded',
          fill: '#111827',
          stroke: '#FF6B6B',
          strokeWidth: 0.008,
          radius: 0.15,
          x: 100,
          y: 890,
          w: 880,
          h: 140,
          rotation: 0,
          z: 20,
          opacity: 0.95,
        },
        {
          id: 'tpl-solidarity-text',
          type: 'text',
          text: '#Solidarite2026',
          font: 'Poppins',
          size: 52,
          color: '#FFFFFF',
          align: 'center',
          weight: 'bold',
          style: 'normal',
          letterSpacing: 20,
          lineHeight: 1.16,
          curve: 0,
          x: 120,
          y: 935,
          w: 840,
          h: 60,
          rotation: 0,
          z: 30,
          opacity: 1,
        },
      ],
    },
  },
  {
    id: 'minimal-white-frame',
    title: 'Minimaliste & Signature',
    description: 'Cadre blanc épuré, signature en typographie manuscrite élégante.',
    kind: 'photo_frame',
    category: 'photo_frame',
    ratio: '1:1',
    tags: ['minimaliste', 'blanc', 'signature', 'artistique'],
    descriptor: {
      version: 1,
      ratio: '1:1',
      background: 'transparent',
      layers: [
        {
          id: 'tpl-frame-top',
          type: 'shape',
          kind: 'rect',
          fill: '#FFFFFF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 0,
          y: 0,
          w: 1080,
          h: 40,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        {
          id: 'tpl-frame-bottom',
          type: 'shape',
          kind: 'rect',
          fill: '#FFFFFF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 0,
          y: 980,
          w: 1080,
          h: 100,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        {
          id: 'tpl-frame-left',
          type: 'shape',
          kind: 'rect',
          fill: '#FFFFFF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 0,
          y: 0,
          w: 40,
          h: 1080,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        {
          id: 'tpl-frame-right',
          type: 'shape',
          kind: 'rect',
          fill: '#FFFFFF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 1040,
          y: 0,
          w: 40,
          h: 1080,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        {
          id: 'tpl-signature',
          type: 'text',
          text: 'Moments Précieux 2026',
          font: 'Satisfy',
          size: 50,
          color: '#111827',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 10,
          lineHeight: 1.16,
          curve: 0,
          x: 80,
          y: 1000,
          w: 920,
          h: 60,
          rotation: 0,
          z: 20,
          opacity: 1,
        },
      ],
    },
  },
];

/**
 * Ramène les calques d'un modèle dans le format de la campagne.
 *
 * Un modèle est écrit dans **son** format (9:16, 1:1…). L'appliquer sur une
 * campagne d'un autre format ne peut pas être cohérent : soit on rogne, soit on
 * change le format de la campagne — et le créateur l'a choisi exprès à la
 * création. On met donc le modèle à l'échelle.
 *
 * L'échelle n'est pas uniforme : les positions et tailles suivent leur axe
 * (une hauteur suit une hauteur), mais la **taille du texte** suit la plus
 * petite des deux. Un texte mis à l'échelle verticalement déborderait d'un
 * cadre étroit dans un cadre large ; il resterait lisible dans l'autre sens.
 *
 * L'épaisseur de contour et l'arrondi ne sont pas touchés : le descripteur les
 * stocke en fraction, jamais en pixels. Les recalculer les rendrait faux.
 */
function rescaleTo(
  layers: Layer[],
  from: { width: number; height: number },
  to: Ratio,
): Layer[] {
  const target = ratioSpec(to);
  const sx = target.width / from.width;
  const sy = target.height / from.height;
  const uniform = Math.min(sx, sy);

  return layers.map((layer) => {
    const base = {
      ...layer,
      x: Math.round(layer.x * sx),
      y: Math.round(layer.y * sy),
      w: Math.max(1, Math.round(layer.w * sx)),
      h: Math.max(1, Math.round(layer.h * sy)),
    };

    if (base.type !== 'text') return base;

    return {
      ...base,
      // Au moins 8 px : en dessous, un texte cesse d'être lisible, et le modèle
      // aurait l'air cassé plutôt que redimensionné.
      size: Math.max(8, Math.round(base.size * uniform)),
      /*
       * L'espacement des lettres est en millièmes de la taille du corps, pas
       * en pixels absolus : il suit donc la même échelle que le texte, sinon un
       * titre survolé en 9:16 perdrait son interlettrage une fois ramené en 1:1.
       */
      letterSpacing: Math.round(base.letterSpacing * uniform),
    };
  });
}

/** Calques d'image réellement importés par le créateur — pas les zones photo. */
function isUserImage(layer: Layer, anchorId?: string): boolean {
  if (layer.type !== 'image') return false;
  if (layer.id === anchorId) return false;
  // Les calques d'ancrage sont des SVG transparents encodés en dur : ce sont
  // des zones, pas des photos. Les garder reviendrait à superposer un second
  // rectangle invisible sur la zone du modèle.
  return !layer.src.startsWith('data:image/svg');
}

/**
 * Applique un modèle à un descripteur existant.
 *
 * Le format et le type de campagne ne changent jamais : seul le décor est
 * remplacé. Les textes et les photos du créateur sont reconduits si
 * `preserveExisting` est actif, pour ne pas jeter un message déjà rédigé.
 */
export function applyTemplate(
  current: Descriptor,
  template: FrameTemplate,
  preserveExisting = true,
): Descriptor {
  const clone: Descriptor = JSON.parse(JSON.stringify(template.descriptor));
  const from = ratioSpec(clone.ratio);

  // Le cadre garde son format et son décor : seuls les calques sont remplacés.
  const next: Descriptor = {
    ...clone,
    ratio: current.ratio,
    background: current.background,
    layers: rescaleTo(clone.layers, from, current.ratio),
    motion: clone.motion,
  };

  if (!preserveExisting) {
    return next;
  }

  /*
   * Les textes du créateur reprennent les emplacements de texte du modèle, dans
   * l'ordre. C'est un appariement par rang, pas par identité : un modèle a ses
   * propres exemples (« Promotion 2026 »), et rien ne permet de dire que le
   * texte du créateur est « le » titre plutôt que le sous-titre. Le premier
   * texte rencontré est donc le plus important, ce qui est l'ordre d'écriture
   * attendu.
   */
  const existingTexts = current.layers
    .filter((l): l is TextLayer => l.type === 'text' && l.text.trim().length > 0)
    .map((l) => l.text.trim());

  if (existingTexts.length > 0) {
    let rank = 0;
    next.layers = next.layers.map((layer) => {
      if (layer.type !== 'text' || rank >= existingTexts.length) return layer;
      const text = existingTexts[rank];
      rank += 1;
      return { ...layer, text };
    });
  }

  /*
   * Les photos du créateur sont réajoutées **par-dessus** le modèle, avec un
   * `z` franchement supérieur. Le modèle est un décor : ses propres calques ont
   * des `z` courts, et une photo reprise à son `z` d'origine se retrouverait
   * enterrée sous le bandeau du modèle — invisible, sans explication.
   */
  const userImages = current.layers.filter((l) => isUserImage(l, current.photo_anchor));
  if (userImages.length > 0) {
    const top = next.layers.reduce((max, layer) => Math.max(max, layer.z), 0);
    const carried = userImages.map((layer, index) => ({
      ...layer,
      z: top + (index + 1) * 10,
    }));
    next.layers = [...next.layers, ...carried];
  }

  /*
   * La zone photo du modèle est prioritaire : c'est elle qui définit le mode
   * Fond. Si le modèle n'en contient pas, on ne laisse pas un identifiant
   * périmé — le cadre resterait en mode Fond sur une zone qui n'existe plus.
   */
  if (next.photo_anchor && !next.layers.some((l) => l.id === next.photo_anchor)) {
    next.photo_anchor = undefined;
  }

  return next;
}
