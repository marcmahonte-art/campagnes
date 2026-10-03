'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, FabricImage, FabricObject, IText } from 'fabric';
import { cn } from '@/lib/cn';
import { ratioSpec } from '@/lib/ratios';
import { photoZone } from '@/lib/descriptor';
import { createImageObject } from '@/lib/fabric-image';
import { createShapeObject } from '@/lib/fabric-shape';
import { createBrandGradient, createTextObject, resolveTextFill, setTextContent } from '@/lib/fabric-text';
import {
  DEFAULT_PARTICIPANT_STYLE,
  clampPlacement,
  clampTextPosition,
  participantTextLayer,
  participantTextWidth,
  photoLayer,
  photoSize,
  type ParticipantPhoto,
  type ParticipantStyle,
  type ParticipantText,
  type PhotoPlacement,
} from '@/lib/participant';
import { applyPhotoFilter, type PhotoFilter } from '@/lib/photo-filters';
import { addBadge } from '@/lib/watermark';
import type { Descriptor } from '@/lib/types';

/**
 * Scène du parcours participant.
 *
 * Elle affiche le cadre du créateur **par-dessus** les calques du participant :
 * sa photo, puis son texte. Le cadre est inerte (ni sélectionnable, ni
 * déplaçable) : le participant ne bouge que ce qui lui appartient. C'est la
 * traduction directe de la règle produit — le cadre est un contrat figé, la
 * photo et le texte sont les seules variables.
 *
 * Le canvas travaille dans le repère natif du ratio et n'est réduit à l'écran
 * que par `setZoom` : les coordonnées échangées avec le parent sont donc
 * exactement celles du descripteur, sans conversion.
 *
 * **Aucun réglage de pixels n'est appliqué au canvas seul.** Le filtre photo
 * passe par `applyPhotoFilter()`, la même fonction que l'export : l'écran et le
 * fichier ne peuvent pas diverger.
 */
export function ParticipantStage({
  descriptor,
  photo,
  placement,
  style = DEFAULT_PARTICIPANT_STYLE,
  watermark = false,
  onPlacementChange,
  onTextChange,
  onReady,
}: {
  descriptor: Descriptor;
  photo: ParticipantPhoto;
  placement: PhotoPlacement;
  /** Filtre et texte du participant. */
  style?: ParticipantStyle;
  /** Affiche le filigrane à l'écran, exactement là où l'export le posera. */
  watermark?: boolean;
  onPlacementChange: (next: PhotoPlacement) => void;
  onTextChange?: (next: ParticipantText) => void;
  onReady?: (api: { fitToView: () => void }) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const photoObjectRef = useRef<FabricImage | null>(null);
  const textObjectRef = useRef<IText | null>(null);

  /** Dernier placement émis : évite que le parent nous le renvoie en boucle. */
  const lastEmitted = useRef<string>('');
  const placementRef = useRef(placement);
  placementRef.current = placement;

  /**
   * Le style est lu par référence dans les effets : le contenu du texte change à
   * chaque frappe, et le mettre en dépendance reconstruirait la scène entière
   * pendant que le participant écrit.
   */
  const styleRef = useRef(style);
  styleRef.current = style;

  /** Filtre réellement appliqué à l'objet photo, pour ne pas le refiltrer pour rien. */
  const appliedFilter = useRef<PhotoFilter | null>(null);

  const [zoom, setZoom] = useState(0.3);
  /**
   * Incrémenté quand la scène vient d'être (re)construite.
   *
   * La construction est asynchrone, alors que les effets React s'exécutent avant
   * que le canvas n'existe. Ce compteur donne aux effets dépendants du canvas un
   * signal fiable — sans lui, ni le filtre ni le texte ne se poseraient après une
   * reconstruction.
   */
  const [ready, setReady] = useState(0);

  const spec = useMemo(() => ratioSpec(descriptor.ratio), [descriptor.ratio]);
  const layers = useMemo(
    () => [...descriptor.layers].sort((a, b) => a.z - b.z),
    [descriptor.layers],
  );
  /** Tout le calcul de placement se fait dans la zone, pas dans le cadre entier. */
  const zone = useMemo(() => photoZone(descriptor), [descriptor]);

  const placementKey = (p: PhotoPlacement) =>
    `${p.zoom.toFixed(4)}|${Math.round(p.x)}|${Math.round(p.y)}`;

  const textActive = style.text !== null;
  const textSize = style.text?.size ?? 24;
  const textBold = style.text?.bold ?? false;
  const textItalic = style.text?.italic ?? false;
  const textFont = style.text?.font ?? 'Inter';
  const textOpacity = style.text?.opacity ?? 1;

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

  /**
   * Le texte, lui, n'a pas de domaine autorisé : il se pose où le participant
   * veut. On le retient seulement dans le cadre, sinon il deviendrait
   * irrécupérable — la scène ne se déplace pas.
   */
  const emitText = useCallback(
    (object: FabricObject) => {
      const current = styleRef.current.text;
      if (!current) return;

      const size = {
        w: (object.width ?? 0) * (object.scaleX ?? 1),
        h: (object.height ?? 0) * (object.scaleY ?? 1),
      };
      const safe = clampTextPosition(
        size,
        { w: spec.width, h: spec.height },
        object.left ?? (current as ParticipantText & { x?: number; y?: number }).x ?? 0,
        object.top ?? (current as ParticipantText & { x?: number; y?: number }).y ?? 0,
      );

      object.set({ left: safe.x, top: safe.y });
      object.setCoords();
      onTextChange?.({
        ...current,
        x: Math.round(safe.x),
        y: Math.round(safe.y),
        rotation: Math.round(object.angle ?? current.rotation ?? 0),
      } as ParticipantText);
    },
    [onTextChange, spec.width, spec.height],
  );

  /* ---------------- Construction du texte ---------------- */
  const buildTextObject = useCallback(async (): Promise<IText | null> => {
    const text = styleRef.current.text;
    if (!text) return null;

    const layer = participantTextLayer(text, zone, descriptor.ratio);
    return createTextObject(layer, {
      interactive: true,
      fitWidth: participantTextWidth(zone),
    });
  }, [zone, descriptor.ratio]);

  /* ---------------- Montage ---------------- */
  useEffect(() => {
    let disposed = false;
    let canvas: FabricCanvas | null = null;

    void (async () => {
      const { Canvas } = await import('fabric');
      if (disposed || !canvasElRef.current) return;

      canvas = new Canvas(canvasElRef.current, {
        preserveObjectStacking: true,
        // Pas de sélection au lasso : il n'y a que des objets mobiles isolés, et
        // un rectangle de sélection accidentel donnerait l'impression d'un bug.
        selection: false,
        backgroundColor: 'transparent',
      });
      canvasRef.current = canvas;

      /* 1. La photo du participant — tout en bas, et mobile. */
      try {
        const start = placementRef.current;
        const image = await createImageObject(
          photoLayer(photo, zone, start, 0, styleRef.current.filter),
          {
            interactive: true,
            /*
             * En mode Fond, la photo est découpée à la zone. Le rectangle de
             * découpe est `absolutePositioned` : il vit dans le repère du canvas,
             * donc il ne suit ni le déplacement de la photo ni le zoom de la vue.
             * C'est exactement ce que fait l'export.
             */
            clip: descriptor.photo_anchor ? zone : null,
          },
        );
        if (disposed) return;

        canvas.add(image);
        photoObjectRef.current = image;
        appliedFilter.current = styleRef.current.filter;
      } catch {
        /* l'absence de photo est gérée par le parent, qui ne monte pas cette scène */
      }

      /*
       * 1bis. Le texte du participant, AU-DESSUS de sa photo ET du cadre.
       *
       * Il est inséré en dernier (au-dessus de tout) pour que le texte
       * du participant recouvre les calques du cadre — c'est la promesse
       * produit : le texte se lit par-dessus le cadre.
       */
      const text = await buildTextObject();
      if (disposed) return;
      if (text) {
        text.set({
          hasControls: true,
          hasBorders: true,
          borderColor: '#ef4444',
          cornerColor: '#ffffff',
          cornerStrokeColor: '#9ca3af',
          cornerSize: 10,
          cornerStyle: 'circle',
          transparentCorners: false,
          lockRotation: false,
        });
        canvas.insertAt(canvas.getObjects().length - 1, text);
        textObjectRef.current = text;
      }

      /* 2. Les calques du cadre — par-dessus, inertes. */
      for (const layer of layers) {
        try {
          if (layer.type === 'shape') {
            // Inerte, comme le texte du créateur : seul le cadre compte, et les
            // calques du participant doivent rester les seuls objets attrapables.
            // `hidden` par Fabric : un calque masqué dans l'éditeur ne doit pas
            // apparaître après publication, sinon « masquer » ne masquerait
            // que chez le créateur.
            const object = await createShapeObject(layer, descriptor.ratio);
            object.set({ visible: layer.visible !== false } as never);
            canvas.add(object);
          } else if (layer.type === 'text') {
            const object = await createTextObject(layer, {
              visible: layer.visible !== false,
            });
            canvas.add(object);
          } else {
            if (!layer.src) continue;
            const object = await createImageObject(layer, {
              visible: layer.visible !== false,
            });
            canvas.add(object);
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
       * Inerte, il n'intercepte jamais le glissement.
       */
      if (watermark) {
        await addBadge(canvas, spec.width, spec.height);
        if (disposed) return;
      }

      canvas.requestRenderAll();
      setReady((n) => n + 1);

      /* 4. Le déplacement ne peut jamais découvrir le cadre. */
      canvas.on('object:moving', (event) => {
        const object = event.target;
        if (!object) return;

        if (object === photoObjectRef.current) {
          const safe = clampPlacement(photo, zone, {
            zoom: placementRef.current.zoom,
            x: object.left ?? 0,
            y: object.top ?? 0,
          });
          object.set({ left: safe.x, top: safe.y });
          object.setCoords();
          emit(object);
          return;
        }

        if (object === textObjectRef.current) emitText(object);
      });

      canvas.on('object:rotating', (event) => {
        const object = event.target;
        if (!object) return;
        if (object === textObjectRef.current) emitText(object);
      });

      canvas.on('object:modified', (event) => {
        const object = event.target;
        if (!object) return;
        if (object === photoObjectRef.current) emit(object);
        else if (object === textObjectRef.current) emitText(object);
      });

      fitToView();
      onReady?.({ fitToView });
    })();

    return () => {
      disposed = true;
      void canvas?.dispose();
      canvasRef.current = null;
      photoObjectRef.current = null;
      textObjectRef.current = null;
      appliedFilter.current = null;
    };
    /*
     * La scène se reconstruit quand la photo change : sans cela, « Changer de
     * photo » mettrait à jour l'état du parent sans que le canvas suive.
     * Le badge en fait partie : c'est un objet du canvas, il faut le reposer.
     *
     * Le style n'en fait **pas** partie : filtre, contenu et couleur du texte
     * sont appliqués sur les objets existants, sans reconstruire la scène. La
     * reconstruire à chaque frappe ferait perdre la position du texte et
     * rechargerait toutes les images du cadre — un clignotement pour rien.
     */
  }, [
    photo,
    layers,
    zone,
    watermark,
    spec.width,
    spec.height,
    emit,
    emitText,
    buildTextObject,
    descriptor.photo_anchor,
    descriptor.ratio,
    fitToView,
    onReady,
  ]);

  /* ---------------- Le filtre change ---------------- */
  useEffect(() => {
    const object = photoObjectRef.current;
    const canvas = canvasRef.current;
    if (!object || !canvas) return;
    if (appliedFilter.current === style.filter) return;

    let alive = true;
    void (async () => {
      await applyPhotoFilter(object, style.filter);
      if (!alive) return;
      appliedFilter.current = style.filter;
      object.setCoords();
      canvas.requestRenderAll();
    })();

    return () => {
      alive = false;
    };
    // `ready` : après une reconstruction, le filtre doit être reposé sur le
    // nouvel objet photo.
  }, [style.filter, ready]);

  /* ---------------- Le texte apparaît ou disparaît ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const current = textObjectRef.current;

    if (!textActive) {
      if (current) {
        canvas.remove(current);
        textObjectRef.current = null;
        canvas.requestRenderAll();
      }
      return;
    }

    // Déjà en place : c'est l'effet de contenu qui prend la suite.
    if (current) return;

    let alive = true;
    void (async () => {
      const object = await buildTextObject();
      if (!alive || !object) return;
      const target = canvasRef.current;
      if (!target) return;

      // Juste au-dessus de la photo : la même place que dans le descripteur.
      const photoIndex = photoObjectRef.current
        ? target.getObjects().indexOf(photoObjectRef.current)
        : -1;
      object.set({
        hasControls: true,
        hasBorders: true,
        borderColor: '#ef4444',
        cornerColor: '#ffffff',
        cornerStrokeColor: '#9ca3af',
        cornerSize: 10,
        cornerStyle: 'circle',
        transparentCorners: false,
        lockRotation: false,
      });
      target.insertAt(photoIndex + 1, object);
      textObjectRef.current = object;
      target.requestRenderAll();
    })();

    return () => {
      alive = false;
    };
  }, [textActive, ready, buildTextObject]);

  /* ---------------- Le contenu, la couleur, la taille, le style, l'opacité du texte change ---------------- */
  const textContent = style.text?.content ?? '';
  const textColor = style.text?.color ?? '';
  const textAlign = style.text?.align ?? 'left';

  useEffect(() => {
    const object = textObjectRef.current;
    const canvas = canvasRef.current;
    const current = styleRef.current.text;
    if (!object || !canvas || !current) return;

    let alive = true;
    void (async () => {
      const fill = await resolveTextFill(current.color);
      if (!alive) return;
      object.set({
        fill: fill as string,
        fontSize: current.size,
        fontWeight: current.bold ? 'bold' : 'normal',
        fontStyle: current.italic ? 'italic' : 'normal',
        underline: Boolean(current.underline),
        linethrough: Boolean(current.strikethrough),
        angle: current.rotation ?? 0,
        fontFamily: current.font,
        opacity: current.opacity,
        textAlign: current.align,
      });
      // Reconstruire la police Google si nécessaire
      if (current.font !== 'Inter' && typeof document !== 'undefined') {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(current.font.replace(/ /g, '+'))}&display=swap`;
        document.head.appendChild(link);
      }
      setTextContent(object, current.content, participantTextWidth(zone));
      canvas.requestRenderAll();
    })();

    return () => {
      alive = false;
    };
  }, [
    textContent,
    textColor,
    textAlign,
    style.text?.size,
    style.text?.bold,
    style.text?.italic,
    style.text?.underline,
    style.text?.strikethrough,
    style.text?.rotation,
    style.text?.font,
    zone,
  ]);

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
        'rounded-lg p-4 md:min-h-[380px] md:p-6',
      )}
      style={{
        backgroundColor: '#787878',
      }}
    >
      <div
        className="relative"
        style={{
          lineHeight: 0,
          boxShadow: '0 4px 24px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)',
        }}
      >
        {/* Damier de transparence sous le canvas (style Twibbonize / Photopea) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #c8c8c8 25%, transparent 25%, transparent 75%, #c8c8c8 75%), linear-gradient(45deg, #c8c8c8 25%, transparent 25%, transparent 75%, #c8c8c8 75%)',
            backgroundSize: '14px 14px',
            backgroundPosition: '0 0, 7px 7px',
            backgroundColor: '#f0f0f0',
          }}
        />

        <canvas ref={canvasElRef} role="img" aria-label="Cadre de campagne avec votre photo" />

        {/* Contour subtil du cadre */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.4)' }}
        />
      </div>

      <span className="sr-only">
        Repère du cadre : {spec.width} × {spec.height} · zoom {Math.round(zoom * 100)} %
      </span>
    </div>
  );
}
