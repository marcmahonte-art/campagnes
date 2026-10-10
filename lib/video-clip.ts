/**
 * Clip vidéo du participant.
 *
 * Le parcours vidéo suit **exactement** la même promesse que le parcours photo :
 * rien ne quitte l'appareil. La vidéo est lue localement, composée avec le cadre
 * dans le navigateur, et c'est le fichier final qui est produit sur l'appareil.
 *
 * Deux règles structurent ce module :
 *
 * 1. **La durée est un plafond, pas une cible.** Un clip ne dépasse jamais
 *    `MAX_CLIP_MS`. Une source plus longue n'est pas refusée : on en retient une
 *    fenêtre de 30 s, choisie par le participant. C'est ce qui évite d'imposer
 *    un montage dans une autre application.
 *
 * 2. **Aucun réencodage à la sélection.** La fenêtre est décrite par deux
 *    nombres ; elle est appliquée au moment du rendu, pas à l'import. Sélectionner
 *    un extrait ne coûte donc ni temps, ni batterie, ni qualité — contrairement à
 *    un découpage qui réencoderait le fichier avant même de savoir s'il convient.
 *
 * La géométrie n'est pas réinventée ici : le clip expose ses dimensions comme le
 * ferait une photo, et `pseudoPhoto()` fabrique la valeur que le parcours photo
 * attend déjà. Tout le placement (zoom, couverture de zone, bornes) reste donc
 * dans `lib/participant.ts`, avec une seule implémentation.
 */

import type { ParticipantPhoto } from './participant';

/**
 * Durée maximale d'un clip.
 *
 * 30 secondes, comme un statut vidéo : assez pour un message, assez court pour
 * rester composable sur un téléphone d'entrée de gamme.
 */
export const MAX_CLIP_MS = 30_000;

/** Pas du curseur de sélection, en millisecondes. */
export const CLIP_STEP_MS = 100;

/** Délai au-delà duquel une métadonnée illisible est considérée comme un échec. */
const METADATA_TIMEOUT_MS = 15_000;

/**
 * Un pixel transparent, encodé une fois pour toutes.
 *
 * Il sert de `src` à la photo de substitution : jamais affiché, il satisfait le
 * type `ParticipantPhoto` sans imposer une branche vidéo dans toute la géométrie.
 */
export const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export interface ParticipantVideo {
  /** URL d'objet locale. Le fichier n'est jamais téléversé. */
  src: string;
  /** Dimensions natives de la source, en pixels. */
  width: number;
  height: number;
  durationMs: number;
  /**
   * Vrai si une piste audio a été détectée.
   *
   * La détection n'est pas normalisée d'un navigateur à l'autre : `true` est la
   * valeur prudente, et le rendu sait se passer d'audio.
   */
  hasAudio: boolean;
}

/** Une fenêtre de lecture, en millisecondes depuis le début de la source. */
export interface ClipWindow {
  startMs: number;
  endMs: number;
  durationMs: number;
}

/* ------------------------------------------------------------------ */
/* Calculs purs — vérifiables sans navigateur                          */
/* ------------------------------------------------------------------ */

/** Durée exploitable d'une source, ou `null` si elle est inconnue. */
export function knownDuration(durationMs: number): number | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Math.floor(durationMs);
}

/** Position de départ maximale autorisée pour une source. */
export function maxClipStart(durationMs: number): number {
  const total = knownDuration(durationMs);
  if (total === null) return 0;
  return Math.max(0, total - MAX_CLIP_MS);
}

/**
 * La source tient-elle entièrement dans la limite ?
 *
 * Une durée illisible renvoie `false` : on préfère proposer le curseur plutôt
 * que de laisser croire que le clip entier passera.
 */
export function fitsWithinLimit(durationMs: number): boolean {
  const total = knownDuration(durationMs);
  if (total === null) return false;
  return total <= MAX_CLIP_MS;
}

/** Borne une position de départ demandée. */
export function clampClipStart(durationMs: number, startMs: number): number {
  if (!Number.isFinite(startMs) || startMs <= 0) return 0;
  return Math.min(Math.round(startMs), maxClipStart(durationMs));
}

/**
 * La fenêtre réellement rendue pour une source et une position de départ.
 *
 * Fonction unique : l'aperçu, la progression et le rendu l'appellent tous, donc
 * ils ne peuvent pas décrire des fenêtres différentes.
 */
export function clipWindow(durationMs: number, startMs: number): ClipWindow {
  const total = knownDuration(durationMs);
  if (total === null) {
    return { startMs: 0, endMs: MAX_CLIP_MS, durationMs: MAX_CLIP_MS };
  }

  const start = clampClipStart(total, startMs);
  const end = Math.min(total, start + MAX_CLIP_MS);
  return { startMs: start, endMs: end, durationMs: Math.max(0, end - start) };
}

/** `1:05` — durée lisible, jamais un nombre de millisecondes. */
export function formatClipDuration(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * La photo de substitution correspondant au clip.
 *
 * Elle porte les **dimensions de la vidéo** : la couverture de zone, les bornes
 * de déplacement et le zoom produisent donc exactement la même géométrie que
 * pour une photo de même format. Le `src` n'est jamais lu par le rendu vidéo.
 */
export function pseudoPhoto(video: ParticipantVideo): ParticipantPhoto {
  return {
    src: TRANSPARENT_PIXEL,
    naturalWidth: video.width,
    naturalHeight: video.height,
  };
}

/**
 * Le type déclaré du fichier ressemble-t-il à une vidéo ?
 *
 * Ce n'est qu'un premier filtre, pour éviter d'ouvrir un élément média sur un
 * PDF. La vraie validation est la lecture des métadonnées : un type MIME est
 * déclaratif, et souvent faux sur mobile.
 */
export function looksLikeVideo(file: File): boolean {
  if (file.type) return file.type.startsWith('video/');
  return /\.(mp4|m4v|mov|webm|ogv|avi|3gp|mkv)$/i.test(file.name);
}

/* ------------------------------------------------------------------ */
/* Lecture du fichier                                                  */
/* ------------------------------------------------------------------ */

/**
 * Lit une vidéo choisie par le participant.
 *
 * Aucun téléversement : le fichier devient une URL d'objet locale, et les
 * métadonnées sont lues par le décodeur du navigateur. On ne filtre pas sur
 * l'extension — un MOV renommé reste lisible, un MP4 tronqué ne l'est pas.
 */
export async function readVideoFile(file: File): Promise<ParticipantVideo> {
  if (!looksLikeVideo(file)) {
    throw new Error('Ce fichier n’est pas une vidéo. Choisissez un fichier vidéo.');
  }

  const src = URL.createObjectURL(file);

  try {
    const probe = await probeVideo(src);

    if (probe.width <= 0 || probe.height <= 0) {
      throw new Error('Cette vidéo n’a pas de dimensions exploitables.');
    }
    if (knownDuration(probe.durationMs) === null) {
      throw new Error(
        'La durée de cette vidéo est illisible. Essayez un autre fichier, ou une copie exportée depuis votre galerie.',
      );
    }

    return { src, width: probe.width, height: probe.height, durationMs: Math.floor(probe.durationMs), hasAudio: probe.hasAudio };
  } catch (error) {
    // L'URL n'a de sens que si l'appelant la reçoit : sans cela, chaque fichier
    // refusé laisserait un blob retenu en mémoire jusqu'au rechargement.
    URL.revokeObjectURL(src);
    throw error;
  }
}

interface VideoProbe {
  width: number;
  height: number;
  durationMs: number;
  hasAudio: boolean;
}

/** Ouvre un élément média hors écran et attend ses métadonnées. */
export function probeVideo(src: string): Promise<VideoProbe> {
  return new Promise<VideoProbe>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.style.position = 'absolute';
    video.style.width = '0';
    video.style.height = '0';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      fn();
      video.remove();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error('Cette vidéo met trop de temps à répondre. Essayez un autre fichier.')));
    }, METADATA_TIMEOUT_MS);

    const onLoaded = () => {
      finish(() =>
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          durationMs: video.duration * 1000,
          hasAudio: detectAudio(video),
        }),
      );
    };

    const onError = () => {
      finish(() =>
        reject(
          new Error(
            'Cette vidéo utilise un codec que votre navigateur ne prend pas en charge. ' +
              'Si c’est une vidéo iPhone (HEVC/H.265), réglez « Paramètres → Caméra → Formats → Plus compatible » pour produire un MP4 H.264, ' +
              'ou convertissez-la via VLC (Fichier → Convertir).',
          ),
        ),
      );
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);

    document.body.appendChild(video);
    video.src = src;
    video.load();
  });
}

/**
 * Détection d'audio, au mieux.
 *
 * Aucune API ne fait consensus : Chrome expose `webkitAudioDecodedByteCount`,
 * Firefox `mozHasAudio`, les autres `audioTracks`. En l'absence d'information on
 * répond `true` : le rendu tentera la capture, et se contentera d'une vidéo
 * muette si la source n'en a pas. Annoncer « pas d'audio » à tort ferait
 * disparaître le son d'une vidéo qui en avait.
 */
function detectAudio(video: HTMLVideoElement): boolean {
  const candidate = video as HTMLVideoElement & {
    mozHasAudio?: boolean;
    webkitAudioDecodedByteCount?: number;
    audioTracks?: { length: number };
  };

  if (typeof candidate.mozHasAudio === 'boolean') return candidate.mozHasAudio;
  if (typeof candidate.webkitAudioDecodedByteCount === 'number') {
    return candidate.webkitAudioDecodedByteCount > 0;
  }
  if (candidate.audioTracks && typeof candidate.audioTracks.length === 'number') {
    return candidate.audioTracks.length > 0;
  }
  return true;
}
