/**
 * Parcours participant — le cœur du produit.
 *
 * Le participant n'a pas de compte : il ouvre un lien, dépose une photo, la
 * positionne, et repart avec son visuel. Toute la mécanique tient dans une idée
 * simple : **la photo du participant est un calque comme un autre**.
 *
 * Le descripteur du cadre n'est jamais modifié — on y glisse les calques du
 * participant à la bonne place, et le rendu emprunte ensuite exactement le même
 * chemin que côté créateur (`exportPng` / `exportVideo`) : l'aperçu et le fichier
 * téléchargé ne peuvent donc pas diverger.
 *
 * Le participant peut déposer **deux** calques : sa photo, et un texte qu'il
 * écrit lui-même. Les deux voyagent dans le descripteur, donc les deux sont
 * rendus par le même code à l'écran et dans le fichier. Son filtre photo suit la
 * même règle : il est porté par le calque image, jamais appliqué à l'affichage.
 *
 * Deux propriétés à ne pas perdre de vue :
 *
 * 1. **Rien ne quitte l'appareil.** La photo est lue en data URL dans le
 *    navigateur et n'est jamais téléversée : il n'y a ni compte, ni stockage,
 *    ni trace. C'est une promesse produit, pas un détail d'implémentation.
 * 2. **La photo couvre toujours la zone.** Un cadre est un PNG à zones
 *    transparentes : si la photo laissait un trou, on verrait le damier. Les
 *    contraintes de déplacement rendent ce trou impossible, y compris en cas de
 *    code fautif en amont.
 *
 * La zone vaut le cadre entier en mode Cadre, et l'emprise du calque désigné en
 * mode Fond (`photoZone`). Tout le reste du module s'écrit donc en géométrie de
 * rectangle, sans jamais connaître le format.
 */

import {
  DEFAULT_LINE_HEIGHT,
  PARTICIPANT_PHOTO_ID,
  PARTICIPANT_TEXT_ID,
  insertNeutralMotion,
  photoZone,
  type PhotoZone,
} from './descriptor';
import { ratioSpec } from './ratios';
import type { PhotoFilter } from './photo-filters';
import type { Descriptor, ImageLayer, Layer, Ratio, TextLayer, TextFont } from './types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ParticipantPhoto {
  /** Data URL. La photo ne quitte jamais le navigateur. */
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface PhotoPlacement {
  /**
   * Échelle relative à la couverture minimale de la zone :
   * 1 = la photo couvre tout juste la zone.
   */
  zoom: number;
  /** Coin supérieur gauche de la photo, dans le repère du ratio (jamais celui de l'écran). */
  x: number;
  y: number;
}

/**
 * Zoom minimum et maximum.
 * Style Twibbonize : le participant peut dézoomer en-dessous de 1 (jusqu'à 0.2×)
 * pour réduire son image ou l'agrandir jusqu'à 5×.
 */
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 5;

/**
 * Part de la photo laissée au-dessus du centre de la zone quand on la pose pour
 * la première fois. Légèrement au-dessus de 50 % parce qu'un visage se trouve
 * presque toujours dans la moitié haute d'une photo : ce cadrage par défaut
 * tombe juste plus souvent, et le participant n'a le plus souvent rien à ajuster.
 */
const INITIAL_VERTICAL_BIAS = 0.45;

/* ------------------------------------------------------------------ */
/* Géométrie                                                           */
/* ------------------------------------------------------------------ */

/** Taille de la photo à l'échelle de couverture minimale (zoom = 1). */
export function coverSize(photo: ParticipantPhoto, zone: PhotoZone): { w: number; h: number } {
  const scale = Math.max(zone.w / photo.naturalWidth, zone.h / photo.naturalHeight);
  return { w: photo.naturalWidth * scale, h: photo.naturalHeight * scale };
}

/** Taille effective de la photo pour un zoom donné. */
export function photoSize(
  photo: ParticipantPhoto,
  zone: PhotoZone,
  zoom: number,
): { w: number; h: number } {
  const base = coverSize(photo, zone);
  return { w: base.w * zoom, h: base.h * zoom };
}

/**
 * Domaine autorisé du coin supérieur gauche de la photo.
 *
 * Style Twibbonize : l'image peut être déplacée librement et déborder largement
 * hors de la zone de travail / du cadre. On conserve seulement une marge de 30 px
 * pour que l'image reste toujours saisissable au doigt ou à la souris.
 */
export function placementBounds(
  photo: ParticipantPhoto,
  zone: PhotoZone,
  zoom: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const { w, h } = photoSize(photo, zone, zoom);
  return {
    minX: zone.x - w + 30,
    maxX: zone.x + zone.w - 30,
    minY: zone.y - h + 30,
    maxY: zone.y + zone.h - 30,
  };
}

/** Ramène un placement dans le domaine autorisé (déplacement libre avec marge minimale). */
export function clampPlacement(
  photo: ParticipantPhoto,
  zone: PhotoZone,
  placement: PhotoPlacement,
): PhotoPlacement {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, placement.zoom));
  const bounds = placementBounds(photo, zone, zoom);
  return {
    zoom,
    x: Math.min(bounds.maxX, Math.max(bounds.minX, placement.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, placement.y)),
  };
}

/** Placement de départ : couverture initiale optimale (zoom 1), centré sur la zone. */
export function initialPlacement(photo: ParticipantPhoto, zone: PhotoZone): PhotoPlacement {
  const { w, h } = photoSize(photo, zone, 1);
  return {
    zoom: 1,
    x: zone.x + (zone.w - w) / 2,
    y: zone.y + (zone.h - h) * INITIAL_VERTICAL_BIAS,
  };
}

/**
 * Change le zoom en gardant fixe le point situé sous le centre de la zone.
 * Sans cela, zoomer ferait « sauter » la photo vers un coin, ce qui donne
 * l'impression que le réglage est cassé.
 */
export function zoomAroundCenter(
  photo: ParticipantPhoto,
  zone: PhotoZone,
  placement: PhotoPlacement,
  nextZoom: number,
): PhotoPlacement {
  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const factor = clampedZoom / placement.zoom;
  const cx = zone.x + zone.w / 2;
  const cy = zone.y + zone.h / 2;

  return clampPlacement(photo, zone, {
    zoom: clampedZoom,
    x: cx - (cx - placement.x) * factor,
    y: cy - (cy - placement.y) * factor,
  });
}

/** Indique si la photo peut encore bouger sur chaque axe : toujours vrai (Twibbonize). */
export function movableAxes(
  _photo: ParticipantPhoto,
  _zone: PhotoZone,
  _zoom: number,
): { x: boolean; y: boolean } {
  return { x: true, y: true };
}

/**
 * Ramène un texte avec une marge minimale.
 *
 * Style Twibbonize : le texte peut être déplacé librement hors de la zone de travail
 * ou du cadre, avec une marge de 30 px pour qu'il reste attrapable.
 */
export function clampTextPosition(
  size: { w: number; h: number },
  frame: { w: number; h: number },
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: Math.min(frame.w - 30, Math.max(-size.w + 30, x)),
    y: Math.min(frame.h - 30, Math.max(-size.h + 30, y)),
  };
}

/* ------------------------------------------------------------------ */
/* Lecture du fichier                                                  */
/* ------------------------------------------------------------------ */

/**
 * Lit une photo choisie par le participant. Aucun téléversement : le fichier est
 * converti en data URL localement.
 *
 * On ne filtre pas sur le type MIME déclaré — il est peu fiable sur mobile — mais
 * sur la capacité réelle du navigateur à décoder l'image.
 */
export async function readPhotoFile(file: File): Promise<ParticipantPhoto> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Ce fichier n'a pas pu être lu."));
    reader.readAsDataURL(file);
  });

  const dimensions = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const probe = new window.Image();
    probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight });
    probe.onerror = () => reject(new Error("Ce fichier n'est pas une image lisible."));
    probe.src = src;
  });

  if (!dimensions.w || !dimensions.h) {
    throw new Error("Cette image n'a pas de dimensions exploitables.");
  }

  return { src, naturalWidth: dimensions.w, naturalHeight: dimensions.h };
}

/* ------------------------------------------------------------------ */
/* Style du participant                                                */
/* ------------------------------------------------------------------ */

/**
 * Le texte que le participant écrit lui-même.
 *
 * La position est un **coin supérieur gauche**, comme pour tous les calques du
 * descripteur : il n'existe donc qu'une seule convention de coordonnées dans
 * tout le projet, et aucun consommateur n'a à savoir qu'il lit un calque
 * « spécial ».
 *
 * Le texte est ancré à gauche parce que c'est ce qui rend la saisie prévisible :
 * la ligne s'allonge vers la droite à mesure qu'on tape, au lieu de se recentrer
 * à chaque lettre — un recentrage continu donnerait l'impression que le texte
 * fuit sous le doigt.
 */
export interface ParticipantText {
  content: string;
  /** Couleur du texte, ou `brand-gradient`. */
  color: string;
  /** Alignement du texte : left, center, right. */
  align: 'left' | 'center' | 'right';
  /** Taille en px. */
  size: number;
  /** Gras. */
  bold: boolean;
  /** Italique. */
  italic: boolean;
  /** Police. */
  font: TextFont;
  /** Opacité 0–1. */
  opacity: number;
  /** Souligné. */
  underline?: boolean;
  /** Barré (strikethrough). */
  strikethrough?: boolean;
  /** Rotation en degrés. */
  rotation?: number;
  /** Coordonnée X dans le repère natif. */
  x?: number;
  /** Coordonnée Y dans le repère natif. */
  y?: number;
  /**
   * Boîte du texte : l'emprise réelle, dans le **même repère** que `x` et `y`.
   *
   * Elle n'est pas un réglage : c'est la mesure de ce que le participant voit,
   * nécessaire pour qu'une taille choisie au pinceau survive au rechargement.
   * Absente tant que le texte n'a pas été mesuré — `participantTextLayer` retombe
   * alors sur le budget de largeur.
   */
  w?: number;
  /** Hauteur de la boîte, même repère que `w`. */
  h?: number;
}

/** Tout ce que le participant peut régler sur son propre visuel. */
export interface ParticipantStyle {
  /** Filtre appliqué à sa photo. `none` = pixels d'origine. */
  filter: PhotoFilter;
  /** `null` = le participant n'a pas ajouté de texte. */
  text: ParticipantText | null;
}

export const DEFAULT_PARTICIPANT_STYLE: ParticipantStyle = {
  filter: 'none',
  text: null,
};

/**
 * Tout l'état du parcours participant, en une seule valeur.
 *
 * C'est **le** point qui rend « annuler / rétablir » possible sans mécanique
 * supplémentaire : l'écran ne détient plus trois `useState` qui dérivent chacun
 * de leur côté, mais un seul objet immuable. Un historique sur cette valeur
 * unique couvre forcément tout ce que le participant règle — s'il oubliait un
 * champ, il suffirait de l'ajouter ici, et l'annulation le prendrait en compte
 * sans qu'aucune ligne de l'écran ne change.
 *
 * `photo` et `placement` valent `null` ensemble : le parcours n'expose aucun
 * réglage avant le dépôt de la photo. Les séparer laisserait un état
 * intermédiaire — une photo sans placement — que rien ne saurait rendre.
 */
export interface ParticipantState {
  photo: ParticipantPhoto | null;
  placement: PhotoPlacement | null;
  style: ParticipantStyle;
}

export const DEFAULT_PARTICIPANT_STATE: ParticipantState = {
  photo: null,
  placement: null,
  style: DEFAULT_PARTICIPANT_STYLE,
};

/**
 * Deux états sont-ils identiques au sens de l'historique ?
 *
 * La comparaison est volontairement **structurelle et stricte**. Le piège serait
 * de tester l'identité de référence : `zoomAroundCenter` renvoie toujours un
 * nouvel objet, même quand le curseur ne bouge pas d'un cran. L'historique se
 * remplirait alors d'entrées identiques, et le participant devrait appuyer dix
 * fois sur « Annuler » pour revenir d'un seul geste — le pire des deux mondes :
 * un bouton qui a l'air actif et ne fait rien.
 */
export function isSameParticipantState(a: ParticipantState, b: ParticipantState): boolean {
  if (a.photo !== b.photo) return false;
  if (!samePlacement(a.placement, b.placement)) return false;
  return sameStyle(a.style, b.style);
}

function samePlacement(a: PhotoPlacement | null, b: PhotoPlacement | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  // Les coordonnées peuvent être fractionnaires : on compare à l'unité près,
  // l'unité la plus fine que le curseur puisse produire.
  return (
    Math.abs(a.zoom - b.zoom) < 1e-6 &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5
  );
}

function sameStyle(a: ParticipantStyle, b: ParticipantStyle): boolean {
  if (a.filter !== b.filter) return false;
  if (a.text === b.text) return true;
  if (!a.text || !b.text) return false;
  return (
    a.text.content === b.text.content &&
    a.text.color === b.text.color &&
    a.text.align === b.text.align &&
    a.text.size === b.text.size &&
    a.text.bold === b.text.bold &&
    a.text.italic === b.text.italic &&
    a.text.font === b.text.font &&
    Math.abs(a.text.opacity - b.text.opacity) < 0.01 &&
    (a.text.underline ?? false) === (b.text.underline ?? false) &&
    (a.text.strikethrough ?? false) === (b.text.strikethrough ?? false) &&
    Math.abs((a.text.rotation ?? 0) - (b.text.rotation ?? 0)) < 0.5 &&
    Math.abs((a.text.x ?? 0) - (b.text.x ?? 0)) < 0.5 &&
    Math.abs((a.text.y ?? 0) - (b.text.y ?? 0)) < 0.5 &&
    // La boîte doit compter dans l'identité : sans elle, un redimensionnement
    // au pinceau serait lu comme « aucun changement », donc **non annulable**.
    Math.abs((a.text.w ?? 0) - (b.text.w ?? 0)) < 0.5 &&
    Math.abs((a.text.h ?? 0) - (b.text.h ?? 0)) < 0.5
  );
}

/**
 * Couleurs proposées au participant.
 *
 * Trois seulement : une pour un fond sombre, une pour un fond clair, et la
 * marque. Une palette plus large transformerait un choix binaire en hésitation,
 * sans jamais régler le seul problème réel — la lisibilité sur la photo.
 */
export const TEXT_COLORS: readonly { id: string; label: string }[] = [
  { id: '#FFFFFF', label: 'Blanc' },
  { id: '#000000', label: 'Noir' },
  { id: 'brand-gradient', label: 'Dégradé' },
];

/** Corps du texte, en fraction du **petit** côté du cadre. */
const TEXT_SIZE_RATIO = 0.075;
/** Part de la largeur de la zone laissée libre à gauche du texte. */
const TEXT_INSET_RATIO = 0.1;
/** Part de la largeur de la zone que le texte ne dépasse jamais. */
const TEXT_MAX_WIDTH_RATIO = 0.8;

/**
 * Longueur maximale du texte du participant.
 *
 * Elle n'est pas une limite technique mais une limite de **lisibilité** : le
 * texte se réduit pour tenir dans le cadre, donc au-delà d'une quarantaine de
 * caractères il deviendrait trop petit pour être lu sur un téléphone. Mieux vaut
 * arrêter la saisie que de laisser écrire un paragraphe illisible.
 */
export const TEXT_MAX_LENGTH = 200;

/** Nombre max de lignes autorisées avant blocage du retour à la ligne. */
const TEXT_MAX_LINES = 12;

/** Corps du texte pour un format donné, en unités du ratio. */
export function participantTextSize(ratio: Ratio): number {
  const spec = ratioSpec(ratio);
  return Math.max(18, Math.round(Math.min(spec.width, spec.height) * TEXT_SIZE_RATIO));
}

/**
 * Largeur que le texte ne doit pas dépasser.
 *
 * Elle n'est pas une boîte : `IText` se dimensionne sur son contenu et ignore la
 * largeur qu'on lui donne. C'est un **budget**, transmis à la fabrique Fabric,
 * qui réduit le corps tant que le texte ne tient pas dedans. Sans ce garde-fou,
 * un texte long sortirait du cadre — et le participant ne le verrait qu'après
 * avoir téléchargé.
 */
export function participantTextWidth(zone: PhotoZone): number {
  return Math.round(zone.w * TEXT_MAX_WIDTH_RATIO);
}

/** Position et couleur de départ d'un texte : à gauche de la zone, centré en hauteur. */
export function defaultParticipantText(zone: PhotoZone, ratio: Ratio): ParticipantText {
  const height = Math.round(participantTextSize(ratio) * 1.3);
  return {
    content: '',
    color: TEXT_COLORS[0].id,
    align: 'left',
    size: participantTextSize(ratio),
    bold: false,
    italic: false,
    font: 'Inter',
    opacity: 1,
    x: Math.round(zone.x + zone.w * 0.1),
    y: Math.round(zone.y + (zone.h - height) / 2),
  };
}

/** Le calque texte correspondant au style du participant. */
export function participantTextLayer(
  text: ParticipantText,
  zone: PhotoZone,
  ratio: Ratio,
  z = 0,
): TextLayer {
  const size = text.size ?? participantTextSize(ratio);
  return {
    id: PARTICIPANT_TEXT_ID,
    type: 'text',
    text: text.content,
    font: text.font ?? 'Inter',
    size,
    color: text.color,
    align: text.align ?? 'left',
    weight: text.bold ? 'bold' : 'normal',
    style: text.italic ? 'italic' : 'normal',
    underline: text.underline ?? false,
    strikethrough: text.strikethrough ?? false,
    letterSpacing: 0,
    lineHeight: DEFAULT_LINE_HEIGHT,
    curve: 0,
    x: text.x ?? 0,
    y: text.y ?? 0,
    // Boîte mesurée quand elle existe, budget sinon. Un `w` absent ferait
    // displays une boîte fantôme à la reconstruction ; le budget est au moins
    // une valeur vraie, même si elle ne colle pas au texte court.
    w: text.w ?? participantTextWidth(zone),
    h: text.h ?? Math.round(size * DEFAULT_LINE_HEIGHT * 1.2),
    rotation: text.rotation ?? 0,
    z,
    opacity: text.opacity ?? 1,
  };
}

/* ------------------------------------------------------------------ */
/* Composition du descripteur                                          */
/* ------------------------------------------------------------------ */

/**
 * La couche image qui porte la photo du participant.
 *
 * Aucun arrondi : le placement affiché et le placement exporté sont les mêmes
 * nombres, au bit près. C'est ce qui garantit que l'aperçu ne peut pas mentir.
 */
export function photoLayer(
  photo: ParticipantPhoto,
  zone: PhotoZone,
  placement: PhotoPlacement,
  z = 0,
  filter: PhotoFilter = 'none',
): ImageLayer {
  const { w, h } = photoSize(photo, zone, placement.zoom);
  return {
    id: PARTICIPANT_PHOTO_ID,
    type: 'image',
    src: photo.src,
    label: 'Ma photo',
    x: placement.x,
    y: placement.y,
    w,
    h,
    rotation: 0,
    z,
    opacity: 1,
    // `none` est omis : une photo sans filtre produit un descripteur identique à
    // celui d'avant l'arrivée des filtres.
    ...(filter !== 'none' ? { filter } : {}),
  };
}

/**
 * L'interstice de `z` laissé par le créateur à la position `insertAt`.
 *
 * Les `z` du créateur sont espacés de 10, mais on ne s'appuie pas dessus — un
 * descripteur relu à la main peut les avoir resserrés.
 */
function gapBounds(sorted: Layer[], insertAt: number): { below: number; above: number } {
  const above = sorted[insertAt]?.z ?? (sorted[sorted.length - 1]?.z ?? 0) + 20;
  const below = insertAt > 0 ? (sorted[insertAt - 1]?.z ?? 0) : above - 20;
  return { below, above };
}

/**
 * Descripteur prêt à rendre : celui du créateur, plus les calques du participant
 * à leur place. L'ordre des calques du créateur est préservé à l'identique —
 * c'est ce qui garantit que le visuel produit est bien celui du cadre publié.
 *
 * En **mode Fond**, les calques du participant se glissent juste au-dessus du
 * calque qui délimite la zone : ils masquent ce calque dans la zone, et son décor
 * reste visible tout autour. En **mode Cadre**, ils passent sous tous les calques
 * et n'apparaissent qu'à travers les zones transparentes du visuel.
 *
 * La photo garde cette logique de fenêtre. Le texte, lui, est volontairement
 * placé au-dessus de tous les calques du cadre : quand un participant écrit, le
 * résultat doit rester lisible et ne jamais disparaître derrière une image, une
 * forme ou un texte du créateur.
 */
export function composeDescriptor(
  frame: Descriptor,
  photo: ParticipantPhoto | null,
  placement: PhotoPlacement | null,
  style: ParticipantStyle = DEFAULT_PARTICIPANT_STYLE,
): Descriptor {
  /*
   * Sans photo, il n'y a rien à composer : le cadre est rendu tel quel. Un texte
   * seul ne suffit pas — le parcours ne le propose qu'après le dépôt de la photo,
   * et un visuel sans photo n'est pas ce que le participant est venu chercher.
   */
  if (!photo || !placement) return frame;

  const zone = photoZone(frame);
  const safe = clampPlacement(photo, zone, placement);

  const sorted = [...frame.layers].sort((a, b) => a.z - b.z);
  const anchorIndex = frame.photo_anchor
    ? sorted.findIndex((layer) => layer.id === frame.photo_anchor)
    : -1;
  const insertAt = anchorIndex === -1 ? 0 : anchorIndex + 1;

  /*
   * Un texte vide n'est pas un calque : le participant qui efface ce qu'il a
   * écrit doit retrouver exactement le visuel d'avant, sans calque fantôme dans
   * le descripteur.
   */
  const text = style.text && style.text.content.trim().length > 0 ? style.text : null;

  /*
   * Calques du participant : la photo se glisse dans la fenêtre du cadre, le
   * texte part au sommet. Les deux ne suivent plus forcément le même endroit du
   * tableau, donc l'animation réserve aussi deux positions neutres distinctes.
   */
  const { below, above } = gapBounds(sorted, insertAt);
  const photoParticipant = photoLayer(photo, zone, safe, (below + above) / 2, style.filter);
  const textLayer = text
    ? participantTextLayer(
        text,
        zone,
        frame.ratio,
        sorted.reduce((m, l) => Math.max(m, l.z), 0) + 10,
      )
    : null;

  const frameLayers = [
    ...sorted.slice(0, insertAt),
    photoParticipant,
    ...sorted.slice(insertAt),
    ...(textLayer ? [textLayer] : []),
  ];

  const motionWithPhoto = insertNeutralMotion(frame.motion, insertAt, frame.layers.length, 1);
  const motionWithText = textLayer
    ? insertNeutralMotion(motionWithPhoto, frame.layers.length + 1, frame.layers.length + 1, 1)
    : motionWithPhoto;

  return {
    ...frame,
    layers: [...frameLayers].sort((a, b) => a.z - b.z),
    // Les calques ajoutés décalent les positions : on leur réserve un mouvement
    // neutre pour que les calques du créateur gardent très exactement le leur.
    motion: motionWithText,
  };
}
