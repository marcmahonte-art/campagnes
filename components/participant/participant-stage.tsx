'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, FabricImage, FabricObject, IText } from 'fabric';
import { cn } from '@/lib/cn';
import { ratioSpec } from '@/lib/ratios';
import { clipsParticipantPhoto, photoZone } from '@/lib/descriptor';
import { createImageObject, createVideoObject } from '@/lib/fabric-image';
import { createShapeObject } from '@/lib/fabric-shape';
import {
  createBrandGradient,
  createTextObject,
  bakeTextScale,
  resolveTextFill,
  setTextContent,
} from '@/lib/fabric-text';
import {
  DEFAULT_PARTICIPANT_STYLE,
  clampPlacement,
  clampTextPosition,
  participantInsertIndex,
  participantTextLayer,
  participantTextWidth,
  photoFit,
  photoLayer,
  photoSize,
  type ParticipantPhoto,
  type ParticipantStyle,
  type ParticipantText,
  type PhotoPlacement,
} from '@/lib/participant';
import { applyPhotoFilter, type PhotoFilter } from '@/lib/photo-filters';
import { addBadge } from '@/lib/watermark';
import type { Descriptor, Layer } from '@/lib/types';

/**
 * Scène du parcours participant.
 *
 * Elle affiche le cadre du créateur **autour** des calques du participant : ce
 * qui est sous la zone photo reste derrière son média, ce qui est au-dessus
 * passe devant, et son texte est au sommet. L'ordre vient du descripteur —
 * jamais d'une règle décidée ici. C'est ce qui interdit à l'aperçu de montrer
 * autre chose que le fichier téléchargé.
 *
 * Le cadre est inerte (ni sélectionnable, ni déplaçable) : le participant ne
 * bouge que ce qui lui appartient. C'est la traduction directe de la règle
 * produit — le cadre est un contrat figé, la photo et le texte sont les seules
 * variables.
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
  textFocusKey = 0,
  video = null,
  onPlacementChange,
  onTextChange,
  onReady,
}: {
  descriptor: Descriptor;
  photo: ParticipantPhoto;
  placement: PhotoPlacement;
  /**
   * Vidéo du participant, quand le parcours en accepte une.
   *
   * Elle remplace la photo **au même endroit et dans la même emprise** : le
   * calque, la zone, les bornes de déplacement et le zoom ne changent pas. La
   * scène redessine simplement l'image courante de la vidéo à chaque rafraîchissement
   * au lieu d'une image immuable.
   */
  video?: HTMLVideoElement | null;
  /** Filtre et texte du participant. */
  style?: ParticipantStyle;
  /** Affiche le filigrane à l'écran, exactement là où l'export le posera. */
  watermark?: boolean;
  /** Incrémenté quand le parent veut placer le curseur dans le texte. */
  textFocusKey?: number;
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
  /** Tout le calcul de placement se fait dans la zone, pas dans le cadre entier. */
  const zone = useMemo(() => photoZone(descriptor), [descriptor]);

  /**
   * Le détourage change deux choses d'un coup, et elles vont ensemble : plus de
   * découpe rectangulaire — c'est le canal alpha du sujet qui masque — et un
   * ajustement « contenir », pour que le sujet tienne entier. Voir `isCutout()`.
   */
  const fit = photoFit(descriptor);
  const clipPhoto = clipsParticipantPhoto(descriptor);

  /**
   * La pile du créateur, coupée au point où le participant s'insère.
   *
   * `below` reste derrière son média, `above` passe devant. Le point de coupe
   * vient de `participantInsertIndex()` — la **même** fonction qui sert à
   * `composeDescriptor()` pour l'export. Deux calculs séparés finiraient par
   * diverger, et l'aperçu montrerait alors un ordre que le fichier n'aurait pas.
   *
   * On le calcule ici, à partir du descripteur **du créateur**, et non du
   * descripteur composé : celui-ci change à chaque déplacement — sa géométrie en
   * dépend — et la scène se reconstruirait alors à chaque geste du doigt.
   */
  const stack = useMemo(() => {
    const sorted = [...descriptor.layers].sort((a, b) => a.z - b.z);
    const at = participantInsertIndex(descriptor, sorted);
    return { below: sorted.slice(0, at), above: sorted.slice(at) };
  }, [descriptor.layers, descriptor.photo_anchor]);

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
      const next = clampPlacement(
        photo,
        zone,
        {
          zoom: placementRef.current.zoom,
          x: object.left ?? 0,
          y: object.top ?? 0,
        },
        fit,
      );
      lastEmitted.current = placementKey(next);
      onPlacementChange(next);
    },
    // `placementKey` est une fonction pure sans dépendance : l'inclure ferait
    // recréer `emit` à chaque rendu sans rien apporter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zone, onPlacementChange, photo, fit],
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

      /*
       * Le repli de l'échelle : un texte étiré au pinceau porte un `scaleX`, pas
       * un corps. Sans cette étape, `size` resterait celui d'origine et le texte
       * reviendrait à sa taille initiale au rechargement — y compris dans le
       * fichier téléchargé, puisque c'est le même descripteur qui sert à l'export.
       */
      const repli = bakeTextScale(object as IText);

      onTextChange?.({
        ...current,
        x: Math.round(safe.x),
        y: Math.round(safe.y),
        w: repli.width,
        h: repli.height,
        size: repli.fontSize,
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

  const decorateTextObject = useCallback((text: IText) => {
    text.set({
      hasControls: true,
      hasBorders: true,
      borderColor: '#111827',
      cornerColor: '#ffffff',
      cornerStrokeColor: '#111827',
      cornerSize: 11,
      cornerStyle: 'circle',
      transparentCorners: false,
      lockRotation: false,
    });
  }, []);

  const bringTextToFront = useCallback(() => {
    const canvas = canvasRef.current;
    const text = textObjectRef.current;
    if (!canvas || !text) return;
    canvas.bringObjectToFront(text);
    canvas.requestRenderAll();
  }, []);

  const focusTextObject = useCallback(() => {
    const canvas = canvasRef.current;
    const text = textObjectRef.current;
    if (!canvas || !text) return;
    canvas.setActiveObject(text);
    bringTextToFront();
    text.enterEditing();
    text.selectAll();
    canvas.requestRenderAll();
  }, [bringTextToFront]);

  const emitTextContent = useCallback(
    (object: IText) => {
      const current = styleRef.current.text;
      if (!current) return;
      const mesure = bakeTextScale(object);
      onTextChange?.({
        ...current,
        content: object.text ?? '',
        w: mesure.width,
        h: mesure.height,
        size: mesure.fontSize,
      } as ParticipantText);
    },
    [onTextChange],
  );

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

      /*
       * 1. La pile, dans l'ordre du descripteur.
       *
       * Ce qui est sous la zone photo d'abord, le média du participant ensuite,
       * ce qui est au-dessus enfin. C'est la répartition même que calcule
       * `composeDescriptor()` pour l'export.
       *
       * Auparavant le média était posé **tout en bas**, puis tous les calques du
       * créateur par-dessus. En mode Fond sur un fond opaque, le participant ne
       * voyait donc pas sa propre photo dans l'aperçu, alors que le fichier
       * téléchargé la plaçait correctement au-dessus du décor : l'aperçu mentait
       * sur le seul point qui compte dans ce mode, l'ordre des plans.
       *
       * `null` marque la place du média — un jeton d'ordre, pas un calque.
       */
      const ordered: (Layer | null)[] = [...stack.below, null, ...stack.above];

      for (const layer of ordered) {
        if (layer === null) {
          /* 2. Le média du participant — à sa place exacte, et mobile. */
          try {
            const start = placementRef.current;
            const media = photoLayer(
              photo,
              zone,
              start,
              0,
              styleRef.current.filter,
              fit,
            );
            /*
             * En mode Fond, le média est découpé à la zone. Le rectangle de
             * découpe est `absolutePositioned` : il vit dans le repère du
             * canvas, donc il ne suit ni le déplacement du média ni le zoom de
             * la vue. C'est exactement ce que fait l'export.
             *
             * En détourage, `clipPhoto` est faux : c'est le canal alpha du sujet
             * qui masque, et une découpe rectangulaire le tronquerait net.
             */
            const clip = clipPhoto ? zone : null;
            const image = video
              ? await createVideoObject(media, video, { interactive: true, clip })
              : await createImageObject(media, { interactive: true, clip });
            if (disposed) return;

            canvas.add(image);
            photoObjectRef.current = image;
            appliedFilter.current = styleRef.current.filter;
          } catch {
            /* l'absence de photo est gérée par le parent, qui ne monte pas cette scène */
          }
          continue;
        }

        /* 3. Un calque du cadre — inerte. */
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
       * 4. Le texte du participant, AU-DESSUS de sa photo ET du cadre.
       *
       * Sa **place** vient du descripteur : il est au sommet, donc un calque de
       * cadre publié après coup ne peut plus passer devant ce qu'il écrit. Son
       * **contenu**, lui, vient du style vivant — c'est ce qu'il est en train de
       * taper, et le reconstruire depuis le descripteur ferait perdre le curseur.
       */
      const text = await buildTextObject();
      if (disposed) return;
      if (text) {
        decorateTextObject(text);
        canvas.add(text);
        textObjectRef.current = text;
        if (textFocusKey) focusTextObject();
      }

      /*
       * 5. Le badge « Créé avec Campagnes ».
       *
       * Il est dessiné par la MÊME fonction que l'export (`lib/watermark.ts`).
       * Un simple aperçu en HTML finirait par diverger de quelques pixels — et
       * le participant découvrirait alors un badge mal placé après téléchargement.
       * Inerte, il n'intercepte jamais le glissement.
       */
      if (watermark) {
        await addBadge(canvas, spec.width, spec.height);
        if (disposed) return;
        bringTextToFront();
      }

      canvas.requestRenderAll();
      setReady((n) => n + 1);

      /* 6. Le déplacement ne peut jamais découvrir le cadre. */
      canvas.on('object:moving', (event) => {
        const object = event.target;
        if (!object) return;

        if (object === photoObjectRef.current) {
          const safe = clampPlacement(
            photo,
            zone,
            {
              zoom: placementRef.current.zoom,
              x: object.left ?? 0,
              y: object.top ?? 0,
            },
            fit,
          );
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

      canvas.on('text:changed', (event) => {
        const object = event.target;
        if (!object || object !== textObjectRef.current) return;
        emitTextContent(object as IText);
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
    video,
    stack,
    clipPhoto,
    fit,
    zone,
    watermark,
    spec.width,
    spec.height,
    emit,
    emitText,
    buildTextObject,
    decorateTextObject,
    bringTextToFront,
    focusTextObject,
    emitTextContent,
    textFocusKey,
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

  /* ---------------- La vidéo avance ---------------- */
  /**
   * Le canvas doit redessiner l'image courante de la vidéo.
   *
   * On ne redessine **que** lorsque c'est nécessaire : pendant la lecture, ou
   * après un déplacement dans la vidéo. Une boucle qui repeindrait en
   * permanence un canvas immobile viderait la batterie du téléphone pour rien,
   * ce qui est exactement le genre de détail qui fait abandonner un parcours.
   */
  useEffect(() => {
    if (!video) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let alive = true;
    let frame = 0;
    let dirty = true;

    const markDirty = () => {
      dirty = true;
    };
    const loop = () => {
      if (!alive) return;
      if (!video.paused || dirty) {
        dirty = false;
        canvas.requestRenderAll();
      }
      frame = requestAnimationFrame(loop);
    };

    video.addEventListener('seeked', markDirty);
    video.addEventListener('loadeddata', markDirty);
    video.addEventListener('play', markDirty);
    frame = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      video.removeEventListener('seeked', markDirty);
      video.removeEventListener('loadeddata', markDirty);
      video.removeEventListener('play', markDirty);
    };
    // `ready` : après une reconstruction de la scène, la boucle doit reprendre
    // sur le nouveau canvas.
  }, [video, ready]);

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

      decorateTextObject(object);
      target.add(object);
      textObjectRef.current = object;
      bringTextToFront();
      focusTextObject();
      target.requestRenderAll();
    })();

    return () => {
      alive = false;
    };
  }, [textActive, ready, buildTextObject, decorateTextObject, bringTextToFront, focusTextObject]);

  useEffect(() => {
    if (!textFocusKey) return;
    focusTextObject();
  }, [textFocusKey, focusTextObject]);

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
      bringTextToFront();
      canvas.requestRenderAll();

      /*
       * La boîte est remesurée ici, à chaque frappe et à chaque changement de
       * corps. Elle fait partie de ce que le participant a choisi : sans cette
       * mesure, `w` garderait la valeur d'une frappe antérieure.
       *
       * Ce n'est pas grave pour l'affichage — `w` ne pilote rien au rendu d'un
       * `IText` — mais ce serait une donnée fausse dans le descripteur
       * téléchargé, donc une incohérence entre ce que le participant règle et ce
       * qui est stocké.
       *
       * On n'émet que sur un **écart réel** : une émission à chaque frappe
       * remplirait l'historique d'annulation d'entrées vides.
       */
      const mesure = bakeTextScale(object);
      const courant = styleRef.current.text;
      if (
        courant &&
        (Math.abs((courant.w ?? -1) - mesure.width) > 0.5 ||
          Math.abs((courant.h ?? -1) - mesure.height) > 0.5)
      ) {
        onTextChange?.({
          ...courant,
          w: mesure.width,
          h: mesure.height,
          size: mesure.fontSize,
        } as ParticipantText);
      }
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
    bringTextToFront,
  ]);

  /* ---------------- Le parent change le placement (curseur de zoom) ---------------- */
  useEffect(() => {
    const object = photoObjectRef.current;
    const canvas = canvasRef.current;
    if (!object || !canvas) return;

    if (placementKey(placement) === lastEmitted.current) return;

    const size = photoSize(photo, zone, placement.zoom, fit);
    const naturalWidth = object.width || size.w;
    const naturalHeight = object.height || size.h;

    object.set({ left: placement.x, top: placement.y });
    object.scaleX = size.w / naturalWidth;
    object.scaleY = size.h / naturalHeight;
    object.setCoords();
    canvas.requestRenderAll();
  }, [placement, photo, zone, fit]);

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
        'rounded-2xl border border-gray-200 p-3 shadow-[0_18px_55px_rgba(15,23,42,0.12)] md:min-h-[380px] md:p-5',
      )}
      style={{
        background:
          'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(248,250,252,0.92))',
      }}
    >
      <div
        className="relative"
        style={{
          lineHeight: 0,
          boxShadow: '0 18px 45px rgba(15,23,42,0.18), 0 1px 0 rgba(255,255,255,0.85)',
          borderRadius: 12,
          overflow: 'hidden',
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

        <canvas
          ref={canvasElRef}
          role="img"
          aria-label={`Cadre de campagne avec votre ${video ? 'vidéo' : 'photo'}`}
        />

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
