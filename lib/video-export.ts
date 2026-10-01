/**
 * Rendu hors écran : PNG haute définition et vidéo WebM.
 *
 * Principe : on ne capture JAMAIS le canvas d'édition. On reconstruit un canvas
 * dédié, à la résolution native du format (1080×1920, …), à partir du descripteur.
 * Conséquence directe : ce qui sort est exactement ce que décrit le descripteur —
 * l'export ne dépend ni du zoom, ni de la taille de la fenêtre, ni du matériel.
 *
 * L'animation, elle, n'est pas réinventée ici : on rejoue `sampleAt()` du Motion
 * Engine, le même que celui de l'aperçu. Aperçu et rendu ne peuvent donc pas
 * diverger.
 */

import { ratioSpec } from './ratios';
import { createTextObject } from './fabric-text';
import { createShapeObject } from './fabric-shape';
import { createImageObject } from './fabric-image';
import { DEFAULT_MOTION_DURATION, sampleAt, type MotionPlan } from './motion';
import { hasFeature, type PlanId } from './plans';
import { PARTICIPANT_PHOTO_ID, effectiveMotion, photoZone } from './descriptor';
import { addBadge } from './watermark';
import type { Descriptor, Layer } from './types';

export interface ExportProgress {
  /** Entre 0 et 1. */
  ratio: number;
}

export interface ExportOptions {
  descriptor: Descriptor;
  /** Formule du compte : détermine la présence du badge « Créé avec Campagnes ». */
  plan: PlanId | string | null;
  fps?: number;
  onProgress?: (progress: ExportProgress) => void;
  /** Permet d'interrompre un rendu long. */
  signal?: AbortSignal;
}

const DEFAULT_FPS = 30;

interface BaseTransform {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
}

/* ------------------------------------------------------------------ */
/* Construction du canvas de rendu                                     */
/* ------------------------------------------------------------------ */

interface RenderTarget {
  /** Le canvas Fabric hors écran, à la résolution native. */
  canvas: import('fabric').StaticCanvas;
  /** Son élément DOM — c'est lui qu'on capture en flux vidéo. */
  element: HTMLCanvasElement;
  /** Les objets, dans l'ordre du descripteur (croissant sur z). */
  objects: import('fabric').FabricObject[];
  /** Leurs transformations d'origine, pour repartir de zéro à chaque rendu. */
  bases: BaseTransform[];
  layers: Layer[];
  /** Libère le canvas. */
  dispose: () => void;
}

async function buildRenderTarget(descriptor: Descriptor): Promise<RenderTarget> {
  const { StaticCanvas } = await import('fabric');
  const spec = ratioSpec(descriptor.ratio);

  /**
   * En mode Fond, la photo du participant doit être découpée à la zone : sans
   * cela elle déborderait sur le décor du cadre. Le rectangle de découpe est
   * `absolutePositioned`, donc exprimé dans le repère du canvas — insensible au
   * déplacement de la photo comme au zoom de l'aperçu.
   */
  const zone = photoZone(descriptor);
  const clipPhoto = Boolean(descriptor.photo_anchor);

  const element = document.createElement('canvas');
  const canvas = new StaticCanvas(element, {
    width: spec.width,
    height: spec.height,
    backgroundColor: 'transparent',
    enableRetinaScaling: false,
    renderOnAddRemove: false,
  });

  // Les polices web doivent être chargées avant le premier rendu, sinon le texte
  // part en police de repli et le rendu ne correspond plus à l'aperçu.
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      /* le rendu se poursuit avec la police disponible */
    }
  }

  const layers = [...descriptor.layers].sort((a, b) => a.z - b.z);
  const objects: import('fabric').FabricObject[] = [];

  for (const layer of layers) {
    try {
      if (layer.type === 'shape') {
        const shape = await createShapeObject(layer, descriptor.ratio);
        // Un calque masqué ne part pas dans le fichier : c'est le même cadre
        // que le participant voit, à l'identique.
        shape.set({ visible: layer.visible !== false } as never);
        canvas.add(shape);
        objects.push(shape);
      } else if (layer.type === 'text') {
        const text = await createTextObject(layer, { visible: layer.visible !== false });
        canvas.add(text);
        objects.push(text);
      } else {
        if (!layer.src) continue;
        /*
         * La construction de l'objet image passe par la fabrique partagée avec
         * l'aperçu participant (`lib/fabric-image.ts`). C'est elle qui applique le
         * filtre du participant et qui honore `visible` — deux réglages qui,
         * écrits ici à la main, finiraient par ne plus correspondre à l'écran.
         *
         * Seule la photo du participant est découpée à la zone : les images du
         * créateur ne l'ont jamais été, et les découper changerait des cadres
         * déjà publiés.
         */
        const image = await createImageObject(layer, {
          clip: clipPhoto && layer.id === PARTICIPANT_PHOTO_ID ? zone : null,
          visible: layer.visible !== false,
        });
        canvas.add(image);
        objects.push(image);
      }
    } catch {
      // Un calque illisible ne doit pas faire échouer tout l'export.
    }
  }

  const bases: BaseTransform[] = objects.map((object) => ({
    left: object.left ?? 0,
    top: object.top ?? 0,
    scaleX: object.scaleX ?? 1,
    scaleY: object.scaleY ?? 1,
    angle: object.angle ?? 0,
    opacity: object.opacity ?? 1,
  }));

  canvas.renderAll();

  return {
    canvas,
    element,
    objects,
    bases,
    layers,
    dispose: () => {
      void canvas.dispose();
    },
  };
}

/** Remet tous les objets dans leur état d'origine. */
function resetToBase(target: RenderTarget): void {
  target.objects.forEach((object, index) => {
    const base = target.bases[index];
    if (!base) return;
    object.set({
      left: base.left,
      top: base.top,
      scaleX: base.scaleX,
      scaleY: base.scaleY,
      angle: base.angle,
      opacity: base.opacity,
    });
    object.setCoords();
  });
}

/** Applique l'animation à l'instant `tMs`. */
function applyMotion(target: RenderTarget, plan: MotionPlan, tMs: number): void {
  target.objects.forEach((object, index) => {
    const base = target.bases[index];
    if (!base) return;
    const layer = target.layers[index];
    const transform = sampleAt(
      plan,
      index,
      tMs,
      layer?.w ?? target.canvas.getWidth(),
      layer?.h ?? target.canvas.getHeight(),
    );

    object.set({
      left: base.left + transform.dx,
      top: base.top + transform.dy,
      scaleX: base.scaleX * transform.scale,
      scaleY: base.scaleY * transform.scale,
      angle: base.angle + transform.rotation,
      opacity: base.opacity * transform.opacity,
    });
    object.setCoords();
  });
}

/**
 * Badge « Créé avec Campagnes » du plan Free. Il est posé en dernier : il reste
 * au-dessus de tout.
 *
 * Le dessin n'est pas refait ici : `lib/watermark.ts` le décrit une seule fois et
 * l'aperçu participant l'appelle aussi. C'est ce qui interdit à l'écran de montrer
 * autre chose que le fichier.
 */
async function addWatermark(target: RenderTarget): Promise<void> {
  await addBadge(target.canvas, target.canvas.getWidth(), target.canvas.getHeight());
  target.canvas.renderAll();
}

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Exporte le cadre au repos, à la résolution native du format.
 * Renvoie une URL de données PNG.
 */
export async function exportPng(options: ExportOptions): Promise<string> {
  const target = await buildRenderTarget(options.descriptor);

  try {
    resetToBase(target);
    if (!hasFeature(options.plan, 'no_watermark')) await addWatermark(target);
    target.canvas.renderAll();
    return target.element.toDataURL('image/png');
  } finally {
    target.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Vidéo WebM                                                          */
/* ------------------------------------------------------------------ */

export interface VideoResult {
  blob: Blob;
  /** Extension cohérente avec le type réellement produit par le navigateur. */
  extension: 'webm' | 'mp4';
  mimeType: string;
}

function pickMimeType(): { mimeType: string; extension: 'webm' | 'mp4' } {
  const candidates: Array<{ mimeType: string; extension: 'webm' | 'mp4' }> = [
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
    { mimeType: 'video/mp4', extension: 'mp4' },
  ];

  const supported =
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? candidates.find((c) => MediaRecorder.isTypeSupported(c.mimeType))
      : undefined;

  return supported ?? candidates[0];
}

/**
 * Rend le cadre animé en vidéo, via `MediaRecorder` et le flux du canvas.
 *
 * Aucune dépendance externe, aucun encodage côté serveur : la vidéo est produite
 * dans le navigateur. Le plan d'animation vient du descripteur, donc la vidéo
 * correspond exactement à l'aperçu — et reste rejouable plus tard côté participant.
 */
export async function exportVideo(options: ExportOptions): Promise<VideoResult> {
  const { descriptor, plan } = options;
  const fps = options.fps ?? DEFAULT_FPS;

  if (typeof MediaRecorder === 'undefined') {
    throw new Error("Votre navigateur ne sait pas produire de vidéo. Essayez l'export PNG.");
  }

  const target = await buildRenderTarget(descriptor);

  try {
    resetToBase(target);
    if (!hasFeature(plan, 'no_watermark')) await addWatermark(target);
    target.canvas.renderAll();

    const { mimeType, extension } = pickMimeType();

    // Le filigrane a été ajouté APRÈS le calcul des transformations et n'est pas
    // dans `target.objects` : il reste donc immobile pendant toute la séquence.

    /*
     * L'animation réellement jouée. En mode Fond, le calque qui délimite la zone
     * photo est figé : sans cela la fenêtre se déplacerait sans la photo et la
     * laisserait dépasser. L'aperçu du créateur applique la même règle, donc la
     * vidéo correspond bien à ce qu'il a vu.
     */
    const motion = effectiveMotion(descriptor);

    const stream = target.element.captureStream(fps);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();

    const duration = Math.max(400, motion?.durationMs ?? DEFAULT_MOTION_DURATION);
    const start = performance.now();

    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (options.signal?.aborted) {
          reject(new DOMException('Export interrompu.', 'AbortError'));
          return;
        }

        const elapsed = performance.now() - start;
        // Sans animation déclarée, on enregistre simplement le cadre au repos :
        // `sampleAt()` n'a rien à échantillonner et planterait sur un plan vide.
        if (motion) applyMotion(target, motion, elapsed);
        target.canvas.renderAll();
        options.onProgress?.({ ratio: Math.min(1, elapsed / duration) });

        if (elapsed >= duration) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });

    // Laisse le dernier rendu entrer dans le flux avant de couper.
    await new Promise((resolve) => setTimeout(resolve, 120));
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());

    options.onProgress?.({ ratio: 1 });

    return { blob: new Blob(chunks, { type: mimeType }), extension, mimeType };
  } finally {
    resetToBase(target);
    target.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Téléchargement                                                      */
/* ------------------------------------------------------------------ */

/** Déclenche le téléchargement d'un contenu produit dans le navigateur. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Laisse le navigateur démarrer le téléchargement avant de libérer l'URL.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Convertit une URL de données en Blob, pour réutiliser `downloadBlob`. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(header)?.[1] ?? 'image/png';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Nom de fichier lisible et sûr, dérivé du nom de campagne. */
export function exportFilename(name: string, extension: string): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'campagne';
  return `${base}.${extension}`;
}
