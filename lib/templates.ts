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

/**
 * Un décor vectoriel encodé en dur.
 *
 * Les décors des modèles détourés sont des SVG : quelques centaines d'octets,
 * redimensionnés sans perte, aucune requête réseau. Le préfixe `data:image/svg`
 * n'est pas cosmétique — `isUserImage()` s'en sert pour distinguer le décor d'un
 * modèle d'une photo réellement importée par le créateur.
 */
function svg(markup: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
}

/**
 * Le calque d'ancrage d'un modèle détouré : un carré transparent de 1×1 étiré à
 * la taille de la zone.
 *
 * Il n'imprime rien. Il porte **deux** informations que rien d'autre ne porte :
 * où le sujet du participant vient se poser (`photoZone()` lit son emprise) et
 * à quel niveau de la pile il s'insère (`participantInsertIndex()` le place
 * juste au-dessus). Les calques du modèle situés **sous** lui passent donc
 * derrière le sujet, ceux situés **au-dessus** passent devant — c'est toute la
 * composition de la référence, et elle tient à ce seul calque.
 */
function cutoutZone(): string {
  return svg('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
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
 * Les trois décors détourés.
 *
 * Chacun est un `background_frame` porteur de `subject: 'cutout'` : le
 * participant y dépose une photo, le sujet est détaché de son arrière-plan et
 * vient se poser **dans** la scène, sans rectangle de découpe. C'est le « look »
 * de la référence, et ces trois modèles en sont le seul chemin d'accès — aucune
 * interface ne pose `subject` autrement.
 *
 * Tous sont écrits en 1:1 et **plein cadre** : `rescaleTo()` les ramène dans le
 * format réel de la campagne, et un décor qui couvre exactement le cadre d'un
 * format le couvre dans tous les autres. Les textes et les formes, eux, sont
 * placés avec une marge telle qu'aucun ne déborde après mise à l'échelle —
 * `check:templates:cutout` le vérifie sur les trois formats, pas sur un seul.
 *
 * **La composition tient à un seul calque.** Le sujet s'insère juste au-dessus
 * de la zone (`cutoutZone()`) : tout ce qui est sous elle passe derrière lui,
 * tout ce qui est au-dessus passe devant. Un décor, donc, se lit en trois
 * plans — le fond, les éléments qui doivent passer derrière le sujet, et ceux
 * qui doivent passer devant (le titre, les badges, les vagues de premier plan).
 */
TEMPLATES.push(
  {
    id: 'cutout-nuit-lunaire',
    title: 'Nuit Lunaire — sujet détouré',
    description:
      'Ciel étoilé et halo de lune : le sujet détouré se découpe devant l’astre. ' +
      'Titre en capitales espacées, sous-titre doré.',
    kind: 'background_frame',
    category: 'background_frame',
    ratio: '1:1',
    tags: ['détourage', 'nuit', 'lune', 'festival', 'carré'],
    descriptor: {
      version: 1,
      ratio: '1:1',
      background: 'transparent',
      subject: 'cutout',
      photo_anchor: 'tpl-lune-zone',
      layers: [
        {
          id: 'tpl-lune-ciel',
          type: 'image',
          src: svg(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">' +
              '<defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0" stop-color="#1E1B4B"/>' +
              '<stop offset=".55" stop-color="#312E81"/>' +
              '<stop offset="1" stop-color="#4C1D95"/>' +
              '</linearGradient></defs>' +
              '<rect width="1080" height="1080" fill="url(#n)"/>' +
              '<circle cx="540" cy="360" r="240" fill="#FFD93D" opacity=".10"/>' +
              '<circle cx="540" cy="360" r="150" fill="#FDE68A" opacity=".30"/>' +
              '<circle cx="190" cy="170" r="4" fill="#FFFFFF" opacity=".9"/>' +
              '<circle cx="880" cy="250" r="5" fill="#FFFFFF" opacity=".8"/>' +
              '<circle cx="300" cy="640" r="3" fill="#FFFFFF" opacity=".7"/>' +
              '<circle cx="820" cy="720" r="4" fill="#FFFFFF" opacity=".7"/>' +
              '<circle cx="120" cy="880" r="3" fill="#FFFFFF" opacity=".6"/>' +
              '<circle cx="960" cy="880" r="4" fill="#FFFFFF" opacity=".6"/>' +
              '</svg>',
          ),
          label: 'Ciel de nuit',
          x: 0,
          y: 0,
          w: 1080,
          h: 1080,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        /*
         * Derrière le sujet : un anneau ouvert autour de l'astre. Il est posé
         * sous la zone, donc le sujet le recouvre par endroits — c'est ce qui
         * fait qu'il « passe derrière » au lieu de flotter devant.
         */
        {
          id: 'tpl-lune-anneau',
          type: 'shape',
          kind: 'circle',
          fill: 'transparent',
          stroke: '#FDE68A',
          strokeWidth: 0.004,
          radius: 0,
          x: 290,
          y: 110,
          w: 500,
          h: 500,
          rotation: 0,
          z: 20,
          opacity: 0.55,
        },
        {
          id: 'tpl-lune-zone',
          type: 'image',
          src: cutoutZone(),
          label: 'Zone du sujet détouré',
          x: 140,
          y: 200,
          w: 800,
          h: 760,
          rotation: 0,
          z: 30,
          opacity: 1,
        },
        /* Devant le sujet : deux étoiles, petites, qui ancrent la profondeur. */
        {
          id: 'tpl-lune-etoile-1',
          type: 'shape',
          kind: 'star',
          fill: '#FFFFFF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 150,
          y: 150,
          w: 72,
          h: 72,
          rotation: 0,
          z: 40,
          opacity: 0.95,
        },
        {
          id: 'tpl-lune-etoile-2',
          type: 'shape',
          kind: 'star',
          fill: '#FFD93D',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 856,
          y: 300,
          w: 60,
          h: 60,
          rotation: 0,
          z: 41,
          opacity: 0.9,
        },
        {
          id: 'tpl-lune-titre',
          type: 'text',
          text: 'MOON RABBIT',
          font: 'Bebas Neue',
          size: 84,
          color: '#FFFFFF',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 60,
          lineHeight: 1.1,
          curve: 0,
          x: 90,
          y: 64,
          w: 900,
          h: 110,
          rotation: 0,
          z: 50,
          opacity: 1,
        },
        {
          id: 'tpl-lune-sous',
          type: 'text',
          text: 'FESTIVAL DE LA LUNE · 2026',
          font: 'Inter',
          size: 28,
          color: '#FDE68A',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 24,
          lineHeight: 1.16,
          curve: 0,
          x: 90,
          y: 976,
          w: 900,
          h: 46,
          rotation: 0,
          z: 51,
          opacity: 1,
        },
      ],
    },
  },
  {
    id: 'cutout-hackathon-tech',
    title: 'Hackathon Tech — sujet détouré',
    description:
      'Fond sombre quadrillé et pastille indigo : le sujet détouré se détache ' +
      'devant le disque, titre techno en bas de cadre.',
    kind: 'background_frame',
    category: 'background_frame',
    ratio: '1:1',
    tags: ['détourage', 'tech', 'hackathon', 'conférence', 'carré'],
    descriptor: {
      version: 1,
      ratio: '1:1',
      background: 'transparent',
      subject: 'cutout',
      photo_anchor: 'tpl-hack-zone',
      layers: [
        {
          id: 'tpl-hack-fond',
          type: 'image',
          src: svg(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">' +
              '<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1">' +
              '<stop offset="0" stop-color="#0B1220"/>' +
              '<stop offset=".6" stop-color="#111C33"/>' +
              '<stop offset="1" stop-color="#1E1B4B"/>' +
              '</linearGradient>' +
              '<pattern id="g" width="60" height="60" patternUnits="userSpaceOnUse">' +
              '<path d="M60 0H0V60" fill="none" stroke="#7B61FF" stroke-width="1" opacity=".16"/>' +
              '</pattern></defs>' +
              '<rect width="1080" height="1080" fill="url(#t)"/>' +
              '<rect width="1080" height="1080" fill="url(#g)"/>' +
              '</svg>',
          ),
          label: 'Fond technique',
          x: 0,
          y: 0,
          w: 1080,
          h: 1080,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        /* Derrière le sujet : le disque de marque. */
        {
          id: 'tpl-hack-disque',
          type: 'shape',
          kind: 'circle',
          fill: '#7B61FF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 300,
          y: 150,
          w: 480,
          h: 480,
          rotation: 0,
          z: 20,
          opacity: 0.35,
        },
        {
          id: 'tpl-hack-zone',
          type: 'image',
          src: cutoutZone(),
          label: 'Zone du sujet détouré',
          x: 150,
          y: 180,
          w: 780,
          h: 720,
          rotation: 0,
          z: 30,
          opacity: 1,
        },
        /* Devant le sujet : la pastille d'édition, puis le titre et le sous-titre. */
        {
          id: 'tpl-hack-pastille',
          type: 'shape',
          kind: 'rounded',
          fill: '#7B61FF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0.5,
          x: 90,
          y: 60,
          w: 480,
          h: 80,
          rotation: 0,
          z: 40,
          opacity: 1,
        },
        {
          id: 'tpl-hack-pastille-txt',
          type: 'text',
          text: 'ÉDITION 2026',
          font: 'Bebas Neue',
          size: 40,
          color: '#FFFFFF',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 40,
          lineHeight: 1.1,
          curve: 0,
          x: 90,
          y: 78,
          w: 480,
          h: 46,
          rotation: 0,
          z: 41,
          opacity: 1,
        },
        {
          id: 'tpl-hack-titre',
          type: 'text',
          text: 'TECH FOR GOOD',
          font: 'Montserrat',
          size: 60,
          color: '#FFFFFF',
          align: 'center',
          weight: 'bold',
          style: 'normal',
          letterSpacing: 30,
          lineHeight: 1.16,
          curve: 0,
          x: 90,
          y: 920,
          w: 900,
          h: 76,
          rotation: 0,
          z: 50,
          opacity: 1,
        },
        {
          id: 'tpl-hack-sous',
          type: 'text',
          text: 'HACKATHON · 48H POUR LA BONNE CAUSE',
          font: 'Inter',
          size: 26,
          color: '#A5B4FC',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 20,
          lineHeight: 1.16,
          curve: 0,
          x: 90,
          y: 1006,
          w: 900,
          h: 42,
          rotation: 0,
          z: 51,
          opacity: 1,
        },
      ],
    },
  },
  {
    id: 'cutout-ocean',
    title: 'Océan — sujet détouré',
    description:
      'Dégradé turquoise, bulles en suspension et vague de premier plan : le sujet ' +
      'détouré émerge au milieu du récif.',
    kind: 'background_frame',
    category: 'background_frame',
    ratio: '1:1',
    tags: ['détourage', 'océan', 'environnement', 'cause', 'carré'],
    descriptor: {
      version: 1,
      ratio: '1:1',
      background: 'transparent',
      subject: 'cutout',
      photo_anchor: 'tpl-ocean-zone',
      layers: [
        {
          id: 'tpl-ocean-fond',
          type: 'image',
          src: svg(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">' +
              '<defs><linearGradient id="o" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0" stop-color="#0E7490"/>' +
              '<stop offset=".45" stop-color="#0369A1"/>' +
              '<stop offset="1" stop-color="#0C4A6E"/>' +
              '</linearGradient></defs>' +
              '<rect width="1080" height="1080" fill="url(#o)"/>' +
              '<path d="M0 260 Q270 200 540 260 T1080 260" fill="none" stroke="#A5F3FC" stroke-width="6" opacity=".18"/>' +
              '<path d="M0 420 Q270 360 540 420 T1080 420" fill="none" stroke="#A5F3FC" stroke-width="5" opacity=".14"/>' +
              '<path d="M0 580 Q270 520 540 580 T1080 580" fill="none" stroke="#A5F3FC" stroke-width="4" opacity=".10"/>' +
              '</svg>',
          ),
          label: 'Eau profonde',
          x: 0,
          y: 0,
          w: 1080,
          h: 1080,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        /* Derrière le sujet : des bulles qui remontent. */
        {
          id: 'tpl-ocean-bulle-1',
          type: 'shape',
          kind: 'circle',
          fill: '#FFFFFF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 180,
          y: 200,
          w: 120,
          h: 120,
          rotation: 0,
          z: 20,
          opacity: 0.18,
        },
        {
          id: 'tpl-ocean-bulle-2',
          type: 'shape',
          kind: 'circle',
          fill: '#FFFFFF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 820,
          y: 340,
          w: 90,
          h: 90,
          rotation: 0,
          z: 21,
          opacity: 0.14,
        },
        {
          id: 'tpl-ocean-bulle-3',
          type: 'shape',
          kind: 'circle',
          fill: '#FFFFFF',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 250,
          y: 520,
          w: 70,
          h: 70,
          rotation: 0,
          z: 22,
          opacity: 0.12,
        },
        {
          id: 'tpl-ocean-zone',
          type: 'image',
          src: cutoutZone(),
          label: 'Zone du sujet détouré',
          x: 170,
          y: 170,
          w: 740,
          h: 740,
          rotation: 0,
          z: 30,
          opacity: 1,
        },
        /* Devant le sujet : la vague de premier plan, qui le coupe aux pieds. */
        {
          id: 'tpl-ocean-vague',
          type: 'shape',
          kind: 'wave',
          fill: '#0369A1',
          stroke: 'transparent',
          strokeWidth: 0,
          radius: 0,
          x: 0,
          y: 890,
          w: 1080,
          h: 180,
          rotation: 0,
          z: 40,
          opacity: 0.9,
        },
        {
          id: 'tpl-ocean-titre',
          type: 'text',
          text: 'SAVE THE OCEAN',
          font: 'Bebas Neue',
          size: 78,
          color: '#FFFFFF',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 40,
          lineHeight: 1.1,
          curve: 0,
          x: 90,
          y: 60,
          w: 900,
          h: 100,
          rotation: 0,
          z: 50,
          opacity: 1,
        },
        {
          id: 'tpl-ocean-sous',
          type: 'text',
          text: '#Ocean2026',
          font: 'Poppins',
          size: 34,
          color: '#A5F3FC',
          align: 'center',
          weight: 'bold',
          style: 'normal',
          letterSpacing: 30,
          lineHeight: 1.16,
          curve: 0,
          x: 90,
          y: 950,
          w: 900,
          h: 52,
          rotation: 0,
          z: 51,
          opacity: 1,
        },
      ],
    },
  },
);

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
 *
 * `kind` est le type de la **campagne** éditée. Il n'est pas décoratif : c'est
 * lui qui décide si le mode du modèle (`subject`) peut être posé. Voir le
 * commentaire de `subject` ci-dessous — sans cette garde, un modèle détouré
 * appliqué à un cadre photo ferait basculer son dimensionnement en « contenir »
 * alors que le parcours participant, lui, ne détoure que les
 * `background_frame`.
 */
export function applyTemplate(
  current: Descriptor,
  template: FrameTemplate,
  preserveExisting = true,
  kind?: CampaignKind,
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
    /*
     * Le mode du modèle ne suit que le type de campagne qui le comprend.
     *
     * Un modèle détouré est un modèle de **Photo sur fond** : son `subject` n'a
     * de sens que là. Ailleurs il serait au mieux ignoré, au pire nuisible —
     * `photoFit()` lit `isCutout()` sans regarder le type de campagne, donc un
     * cadre photo porteur de ce drapeau verrait sa photo **contenue** au lieu de
     * couvrir, c'est-à-dire entourée de transparent là où le participant attend
     * un fond plein.
     *
     * Fermé par défaut : sans `kind`, le mode n'est pas posé. Un appelant qui
     * ignore le type de campagne ne peut donc pas propager un drapeau qu'il ne
     * comprend pas.
     */
    subject: kind === 'background_frame' ? clone.subject : undefined,
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
