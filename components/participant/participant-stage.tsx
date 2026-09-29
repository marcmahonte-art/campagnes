'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, FabricObject } from 'fabric';
import { cn } from '@/lib/cn';
import { ratioSpec } from '@/lib/ratios';
import { photoZone } from '@/lib/descriptor';
import {
  clampPlacement,
  photoSize,
  type ParticipantPhoto,
  type PhotoPlacement,
} from '@/lib/participant';
import { addBadge } from '@/lib/watermark';
import type { Descriptor } from '@/lib/types';

/**
 * Scène du parcours participant.
 *
 * Elle affiche le cadre du créateur **par-dessus** la photo du participant. Le
 * cadre est inerte (ni sélectionnable, ni déplaçable) : seul le participant
 * bouge sa photo. C'est la traduction directe de la règle produit — le cadre est
 * un contrat figé, la photo est la seule variable.
 *
 * Le canvas travaille dans le repère natif du ratio et n'est réduit à l'écran
 * que par `setZoom` : les coordonnées échangées avec le parent sont donc
 * exactement celles du descripteur, sans conversion.
 */
export function ParticipantStage({
  descriptor,
  photo,
  placement,
  watermark = false,
  onPlacementChange,
  onReady,
}: {
  descriptor: Descriptor;
  photo: ParticipantPhoto;
  placement: PhotoPlacement;
  /** Affiche le filigrane à l'écran, exactement là où l'export le posera. */
  watermark?: boolean;
  onPlacementChange: (next: PhotoPlacement) => void;
  onReady?: (api: { fitToView: () => void }) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const photoObjectRef = useRef<FabricObject | null>(null);

  /** Dernier placement émis : évite que le parent nous le renvoie en boucle. */
  const lastEmitted = useRef<string>('');
  const placementRef = useRef(placement);
  placementRef.current = placement;

  const [zoom, setZoom] = useState(0.3);

  const spec = useMemo(() => ratioSpec(descriptor.ratio), [descriptor.ratio]);
  const layers = useMemo(
    () => [...descriptor.layers].sort((a, b) => a.z - b.z),
    [descriptor.layers],
  );
  /** Tout le calcul de placement se fait dans la zone, pas dans le cadre entier. */
  const zone = useMemo(() => photoZone(descriptor), [descriptor]);

  const placementKey = (p: PhotoPlacement) =>
    `${p.zoom.toFixed(4)}|${Math.round(p.x)}|${Math.round(p.y)}`;

  /* ---------------- Zoom adaptatif ---------------- */
  const fitToView = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const available = stage.clientWidth;
    if (available <= 0) return;

    const maxHeight = window.innerWidth < 768 ? 420 : 560;
    const z = Math.min(available / spec.width, maxHeight / spec.height);
    setZoom(z);
    canvas.setDimensions({
      width: Math.round(spec.width * z),
      height: Math.round(spec.height * z),
    });
    canvas.setZoom(z);
    canvas.requestRenderAll();
  }, [spec.height, spec.width]);

  /* ---------------- Émission vers le parent ---------------- */
  const emit = useCallback(
    (object: FabricObject) => {
      const next = clampPlacement(photo, zone, {
        zoom: placementRef.current.zoom,
        x: object.left ?? 0,
        y: object.top ?? 0,
      });
      lastEmitted.current = placementKey(next);
      onPlacementChange(next);
    },
    // `placementKey` est une fonction pure sans dépendance : l'inclure ferait
    // recréer `emit` à chaque rendu sans rien apporter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zone, onPlacementChange, photo],
  );

  /* ---------------- Montage ---------------- */
  useEffect(() => {
    let disposed = false;
    let canvas: FabricCanvas | null = null;

    void (async () => {
      const { Canvas, FabricImage, IText, Rect } = await import('fabric');
      if (disposed || !canvasElRef.current) return;

      canvas = new Canvas(canvasElRef.current, {
        preserveObjectStacking: true,
        // Pas de sélection au lasso : il n'y a qu'un objet mobile, et un
        // rectangle de sélection accidentel donnerait l'impression d'un bug.
        selection: false,
        backgroundColor: 'transparent',
      });
      canvasRef.current = canvas;

      /* 1. La photo du participant — tout en bas, et seule mobile. */
      try {
        const image = await FabricImage.fromURL(photo.src, { crossOrigin: 'anonymous' });
        if (disposed) return;

        const start = placementRef.current;
        const size = photoSize(photo, zone, start.zoom);
        const naturalWidth = image.width || size.w;
        const naturalHeight = image.height || size.h;

        image.set({
          left: start.x,
          top: start.y,
          originX: 'left',
          originY: 'top',
          selectable: true,
          evented: true,
          // Pas de poignées : le zoom se règle au curseur, pas au coin de l'image.
          hasControls: false,
          hasBorders: false,
          lockRotation: true,
          hoverCursor: 'grab',
          moveCursor: 'grabbing',
        });
        image.scaleX = size.w / naturalWidth;
        image.scaleY = size.h / naturalHeight;

        /*
         * En mode Fond, la photo est découpée à la zone. Le rectangle de découpe
         * est `absolutePositioned` : il vit dans le repère du canvas, donc il ne
         * suit ni le déplacement de la photo ni le zoom de la vue. C'est
         * exactement ce que fait l'export — l'écran et le fichier coïncident.
         */
        if (descriptor.photo_anchor) {
          image.clipPath = new Rect({
            left: zone.x,
            top: zone.y,
            width: zone.w,
            height: zone.h,
            originX: 'left',
            originY: 'top',
            absolutePositioned: true,
          });
        }

        canvas.add(image);
        photoObjectRef.current = image;
      } catch {
        /* l'absence de photo est gérée par le parent, qui ne monte pas cette scène */
      }

      /* 2. Les calques du cadre — par-dessus, inertes. */
      for (const layer of layers) {
        try {
          if (layer.type === 'text') {
            const text = new IText(layer.text, {
              left: layer.x,
              top: layer.y,
              angle: layer.rotation,
              opacity: layer.opacity,
              fontFamily: layer.font,
              fontSize: layer.size,
              fill: layer.color,
              textAlign: layer.align,
              width: layer.w,
              originX: 'left',
              originY: 'top',
              selectable: false,
              evented: false,
            });
            canvas.add(text);
          } else {
            if (!layer.src) continue;
            const image = await FabricImage.fromURL(layer.src, { crossOrigin: 'anonymous' });
            if (disposed) return;
            const naturalWidth = image.width || layer.w;
            const naturalHeight = image.height || layer.h;
            image.set({
              left: layer.x,
              top: layer.y,
              angle: layer.rotation,
              opacity: layer.opacity,
              originX: 'left',
              originY: 'top',
              selectable: false,
              evented: false,
            });
            image.scaleX = layer.w / naturalWidth;
            image.scaleY = layer.h / naturalHeight;
            canvas.add(image);
          }
        } catch {
          // Un calque illisible ne doit pas empêcher de participer.
        }
      }

      /*
       * 3. Le badge « Créé avec Campagnes », par-dessus tout.
       *
       * Il est dessiné par la MÊME fonction que l'export (`lib/watermark.ts`).
       * Un simple aperçu en HTML finirait par diverger de quelques pixels — et
       * le participant découvrirait alors un badge mal placé après téléchargement.
       * Inerte, il n'intercepte jamais le glissement de la photo.
       */
      if (watermark) {
        await addBadge(canvas, spec.width, spec.height);
        if (disposed) return;
      }

      canvas.requestRenderAll();

      /* 4. Le déplacement ne peut jamais découvrir le cadre. */
      canvas.on('object:moving', (event) => {
        const object = event.target;
        if (!object || object !== photoObjectRef.current) return;
        const safe = clampPlacement(photo, zone, {
          zoom: placementRef.current.zoom,
          x: object.left ?? 0,
          y: object.top ?? 0,
        });
        object.set({ left: safe.x, top: safe.y });
        object.setCoords();
        emit(object);
      });

      canvas.on('object:modified', (event) => {
        const object = event.target;
        if (object && object === photoObjectRef.current) emit(object);
      });

      fitToView();
      onReady?.({ fitToView });
    })();

    return () => {
      disposed = true;
      void canvas?.dispose();
      canvasRef.current = null;
      photoObjectRef.current = null;
    };
    // La scène se reconstruit quand la photo change : sans cela, « Changer de
    // photo » mettrait à jour l'état du parent sans que le canvas suive.
    // Le badge en fait partie : c'est un objet du canvas, il faut le reposer.
  }, [photo, layers, zone, watermark, spec.width, spec.height, emit, fitToView, onReady]);

  /* ---------------- Le parent change le placement (curseur de zoom) ---------------- */
  useEffect(() => {
    const object = photoObjectRef.current;
    const canvas = canvasRef.current;
    if (!object || !canvas) return;

    if (placementKey(placement) === lastEmitted.current) return;

    const size = photoSize(photo, zone, placement.zoom);
    const naturalWidth = object.width || size.w;
    const naturalHeight = object.height || size.h;

    object.set({ left: placement.x, top: placement.y });
    object.scaleX = size.w / naturalWidth;
    object.scaleY = size.h / naturalHeight;
    object.setCoords();
    canvas.requestRenderAll();
  }, [placement, photo, zone]);

  /* ---------------- Redimensionnement de la fenêtre ---------------- */
  useEffect(() => {
    const onResize = () => fitToView();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitToView]);

  return (
    <div
      ref={stageRef}
      className={cn(
        'relative flex min-h-[280px] items-center justify-center overflow-hidden',
        'rounded-lg border border-gray-200 bg-gray-100 p-3',
      )}
    >
      <div className="relative shadow-md" style={{ lineHeight: 0 }}>
        <canvas ref={canvasElRef} />
      </div>

      <span className="sr-only">
        Repère du cadre : {spec.width} × {spec.height} · zoom {Math.round(zoom * 100)} %
      </span>
    </div>
  );
}
