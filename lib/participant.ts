/**
 * Parcours participant — le cœur du produit.
 *
 * Le participant n'a pas de compte : il ouvre un lien, dépose une photo, la
 * positionne, et repart avec son visuel. Toute la mécanique tient dans une idée
 * simple : **la photo du participant est un calque comme un autre**.
 *
 * Le descripteur du cadre n'est jamais modifié — on y glisse une couche image à
 * la bonne place, et le rendu emprunte ensuite exactement le même chemin que
 * côté créateur (`exportPng` / `exportVideo`) : l'aperçu et le fichier
 * téléchargé ne peuvent donc pas diverger.
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
  PARTICIPANT_PHOTO_ID,
  insertNeutralMotion,
  photoZone,
  type PhotoZone,
} from './descriptor';
import type { Descriptor, ImageLayer, Layer } from './types';

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

/** En deçà de 1, un trou apparaîtrait : c'est une borne produit, pas un réglage. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

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
 * Les bornes sont celles de la zone : la photo peut déborder de la zone, jamais
 * y laisser un vide. Un axe dont le domaine est réduit à un point est verrouillé
 * — c'est le cas quand le zoom vaut 1 sur l'axe qui contraint la couverture.
 */
export function placementBounds(
  photo: ParticipantPhoto,
  zone: PhotoZone,
  zoom: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const { w, h } = photoSize(photo, zone, zoom);
  return {
    minX: zone.x + zone.w - w,
    maxX: zone.x,
    minY: zone.y + zone.h - h,
    maxY: zone.y,
  };
}

/** Ramène un placement dans le domaine autorisé (couverture de la zone garantie). */
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

/** Placement de départ : couverture minimale, centré sur la zone, légèrement remonté. */
export function initialPlacement(photo: ParticipantPhoto, zone: PhotoZone): PhotoPlacement {
  const { w, h } = photoSize(photo, zone, MIN_ZOOM);
  return {
    zoom: MIN_ZOOM,
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

/** Indique si la photo peut encore bouger sur chaque axe, pour guider l'interface. */
export function movableAxes(
  photo: ParticipantPhoto,
  zone: PhotoZone,
  zoom: number,
): { x: boolean; y: boolean } {
  const bounds = placementBounds(photo, zone, zoom);
  return { x: bounds.minX < bounds.maxX, y: bounds.minY < bounds.maxY };
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
  };
}

/**
 * `z` de la photo : strictement entre le calque qu'elle recouvre et celui qui le
 * suit. Les `z` du créateur sont espacés de 10, mais on ne s'appuie pas dessus —
 * un descripteur relu à la main peut les avoir resserrés.
 */
function photoZ(sorted: Layer[], insertAt: number): number {
  const above = sorted[insertAt]?.z ?? (sorted[sorted.length - 1]?.z ?? 0) + 20;
  const below = insertAt > 0 ? (sorted[insertAt - 1]?.z ?? 0) : above - 20;
  return below + (above - below) / 2;
}

/**
 * Descripteur prêt à rendre : celui du créateur, plus la photo du participant à
 * sa place. L'ordre des calques du créateur est préservé à l'identique — c'est
 * ce qui garantit que le visuel produit est bien celui du cadre publié.
 *
 * En **mode Fond**, la photo se glisse juste au-dessus du calque qui délimite la
 * zone : elle masque ce calque dans la zone, et le décor de celui-ci reste
 * visible tout autour. En **mode Cadre**, elle passe sous tous les calques et
 * n'apparaît qu'à travers les zones transparentes du visuel.
 */
export function composeDescriptor(
  frame: Descriptor,
  photo: ParticipantPhoto | null,
  placement: PhotoPlacement | null,
): Descriptor {
  if (!photo || !placement) return frame;

  const zone = photoZone(frame);
  const safe = clampPlacement(photo, zone, placement);

  const sorted = [...frame.layers].sort((a, b) => a.z - b.z);
  const anchorIndex = frame.photo_anchor
    ? sorted.findIndex((layer) => layer.id === frame.photo_anchor)
    : -1;
  const insertAt = anchorIndex === -1 ? 0 : anchorIndex + 1;

  const layer = photoLayer(photo, zone, safe, photoZ(sorted, insertAt));
  const layers = [...sorted.slice(0, insertAt), layer, ...sorted.slice(insertAt)];

  return {
    ...frame,
    layers,
    // La photo décale les positions : on lui réserve un mouvement neutre pour que
    // les calques du créateur gardent très exactement le leur.
    motion: insertNeutralMotion(frame.motion, insertAt, frame.layers.length),
  };
}
