'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, FabricObject } from 'fabric';
import {
  Eye,
  Frame as FrameIcon,
  Loader2,
  Redo2,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { AnimationPanel } from '@/components/editor/animation-panel';
import { FramePanel, LayerPanel, type LayerPatch } from '@/components/editor/context-panel';
import { ToolButton } from '@/components/editor/controls';
import { cn } from '@/lib/cn';
import { ratioSpec } from '@/lib/ratios';
import { effectiveMotion } from '@/lib/descriptor';
import { sampleAt } from '@/lib/motion';
import { backend } from '@/lib/backend';
import type { CampaignKind, Descriptor, ImageLayer, Layer, TextAlign, TextLayer } from '@/lib/types';
import type { PlanId } from '@/lib/plans';

/* ------------------------------------------------------------------ */
/* Pont descripteur ⇄ objets Fabric                                    */
/* ------------------------------------------------------------------ */

type TaggedObject = FabricObject & {
  layerId?: string;
  layerKind?: 'image' | 'text';
  layerSrc?: string;
};

/** Seuil d'aimantation vers le centre, en fraction de la dimension du cadre. */
const CENTER_SNAP = 0.015;

type Tab = 'cadre' | 'animation';

/**
 * Vrai sur mobile — là où le panneau devient une feuille du bas.
 *
 * Sans cette discrimination, un clic sur le rail d'un grand écran ouvrirait
 * aussi la feuille : le même bouton pilote deux présentations, et seule la
 * largeur réelle de la fenêtre dit laquelle est à l'écran.
 */
function isCompactViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

/**
 * Éditeur de cadre.
 *
 * Trois principes tiennent tout l'édifice :
 *
 * 1. **Le canvas travaille dans le repère NATIF du ratio** (1080×1920, …) et
 *    n'est réduit à l'écran que par `setZoom`. Les coordonnées du descripteur
 *    sont donc indépendantes de la taille d'affichage : c'est ce qui rend le
 *    cadre rejouable à l'identique sur un autre écran, et côté participant.
 * 2. **Un seul panneau à la fois**, et son contenu dépend de la sélection.
 *    Jamais toutes les options en même temps, jamais de coordonnées chiffrées.
 * 3. **L'aperçu masque les outils.** Ce qu'on voit en aperçu est ce que le
 *    participant verra — les poignées de Fabric ne font pas partie du cadre.
 */
export function FrameEditor({
  descriptor,
  onChange,
  onReady,
  kind,
  preview = false,
  onPreviewChange,
  playing = false,
  maxLayers = null,
  plan,
  campaignName,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  descriptor: Descriptor;
  onChange: (next: Descriptor, opts?: { coalesce?: boolean }) => void;
  onReady?: (api: { fitToView: () => void; exportThumbnail: () => string | null }) => void;
  /** Type de campagne : décide de ce que l'éditeur propose, sans rien redemander. */
  kind: CampaignKind;
  /** Aperçu : masque les outils d'édition. */
  preview?: boolean;
  onPreviewChange?: (preview: boolean) => void;
  /** Lecture de l'animation. */
  playing?: boolean;
  /** Plafond d'éléments imposé par la formule. `null` = illimité. */
  maxLayers?: number | null;
  plan: PlanId | string | null;
  campaignName: string;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Dernier JSON émis par l'éditeur : évite de se recharger soi-même. */
  const lastEmitted = useRef<string>('');
  /**
   * Vrai pendant la reconstruction de la scène.
   *
   * Sans ce drapeau, `canvas.clear()` et chaque `add()` de la reconstruction
   * émettraient un descripteur **partiel** — un cadre à un calque, puis deux —
   * et l'autosave enregistrerait le cadre amputé. La reconstruction n'est pas
   * une modification : elle n'émet rien.
   */
  const building = useRef(false);
  const descriptorRef = useRef(descriptor);
  descriptorRef.current = descriptor;

  const spec = useMemo(() => ratioSpec(descriptor.ratio), [descriptor.ratio]);
  const specRef = useRef(spec);
  specRef.current = spec;

  /** Transformations d'origine, mémorisées pendant la lecture de l'animation. */
  const baseTransforms = useRef<
    Map<FabricObject, { left: number; top: number; scaleX: number; scaleY: number; angle: number; opacity: number }>
  >(new Map());

  const [zoom, setZoom] = useState(0.3);
  const [tab, setTab] = useState<Tab>('cadre');
  const [sheet, setSheet] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const [locked, setLocked] = useState(true);

  /* ---------------- Émission vers le parent ---------------- */
  const emitFromCanvas = useCallback(
    (opts?: { coalesce?: boolean }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const objects = canvas.getObjects() as TaggedObject[];
      const layers: Layer[] = objects.map((obj, index) => {
        const base = {
          id: obj.layerId ?? `l${index}`,
          x: Math.round(obj.left ?? 0),
          y: Math.round(obj.top ?? 0),
          w: Math.round(obj.getScaledWidth()),
          h: Math.round(obj.getScaledHeight()),
          rotation: Math.round(obj.angle ?? 0),
          z: (index + 1) * 10,
          opacity: Number((obj.opacity ?? 1).toFixed(2)),
        };

        if (obj.layerKind === 'text') {
          const t = obj as FabricObject & {
            text?: string;
            fontFamily?: string;
            fontSize?: number;
            fill?: unknown;
            textAlign?: string;
            fontWeight?: string | number;
          };
          const align: TextAlign =
            t.textAlign === 'left' || t.textAlign === 'right' ? t.textAlign : 'center';
          const font = (t.fontFamily ?? 'Inter') as TextLayer['font'];
          const weight: TextLayer['weight'] =
            t.fontWeight === 'bold' || t.fontWeight === 700 ? 'bold' : 'normal';
          const layer: TextLayer = {
            ...base,
            type: 'text',
            text: t.text ?? '',
            font,
            size: Math.round(t.fontSize ?? 96),
            color: typeof t.fill === 'string' ? t.fill : '#FFFFFF',
            align,
            weight,
          };
          return layer;
        }

        const layer: ImageLayer = { ...base, type: 'image', src: obj.layerSrc ?? '' };
        return layer;
      });

      const next: Descriptor = { ...descriptorRef.current, layers };
      lastEmitted.current = JSON.stringify(next);
      onChange(next, opts);
    },
    [onChange],
  );

  /**
   * Verrou de la zone du participant.
   *
   * La zone est verrouillée **par défaut** : c'est la structure du cadre, la
   * déplacer par inadvertance casserait le parcours participant. Le
   * déverrouillage est donc volontairement caché derrière un `•••`, et reste
   * accessible depuis le panneau du cadre — donc même quand la zone, verrouillée,
   * ne peut plus être sélectionnée.
   */
  const applyLocks = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const anchor = descriptorRef.current.photo_anchor;
    const interactive = !preview;

    for (const obj of canvas.getObjects()) {
      const isZone = (obj as TaggedObject).layerId === anchor;
      const lock = locked && isZone;
      obj.set({
        selectable: interactive && !lock,
        evented: interactive && !lock,
        hasControls: interactive && !lock,
        hoverCursor: interactive && !lock ? 'move' : 'default',
      });
    }
    canvas.requestRenderAll();
  }, [locked, preview]);

  /* ---------------- Construction des objets ---------------- */
  const buildObjects = useCallback(
    async (source: Descriptor) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { FabricImage, IText } = await import('fabric');

      building.current = true;
      canvas.clear();
      canvas.backgroundColor = 'transparent';

      for (const layer of [...source.layers].sort((a, b) => a.z - b.z)) {
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
              fontWeight: layer.weight === 'bold' ? 'bold' : 'normal',
              width: layer.w,
              originX: 'left',
              originY: 'top',
              editable: true,
            });
            const tagged = text as TaggedObject;
            tagged.layerId = layer.id;
            tagged.layerKind = 'text';
            canvas.add(text);
          } else {
            if (!layer.src) continue;
            const img = await FabricImage.fromURL(layer.src, { crossOrigin: 'anonymous' });
            const naturalWidth = img.width || layer.w;
            const naturalHeight = img.height || layer.h;
            img.set({
              left: layer.x,
              top: layer.y,
              angle: layer.rotation,
              opacity: layer.opacity,
              originX: 'left',
              originY: 'top',
            });
            img.scaleX = layer.w / naturalWidth;
            img.scaleY = layer.h / naturalHeight;
            const tagged = img as TaggedObject;
            tagged.layerId = layer.id;
            tagged.layerKind = 'image';
            tagged.layerSrc = layer.src;
            canvas.add(img);
          }
        } catch {
          setError("Un élément n'a pas pu être affiché.");
        }
      }

      canvas.requestRenderAll();
      building.current = false;
      lastEmitted.current = JSON.stringify(source);
    },
    [],
  );

  /* ---------------- Zoom adaptatif ---------------- */
  const fitToView = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const available = stage.clientWidth;
    if (available <= 0) return;

    // La scène est l'élément dominant : elle prend la hauteur disponible.
    const maxHeight = window.innerWidth < 768 ? 320 : 520;
    const z = Math.min(available / specRef.current.width, maxHeight / specRef.current.height);
    setZoom(z);
    canvas.setDimensions({
      width: Math.round(specRef.current.width * z),
      height: Math.round(specRef.current.height * z),
    });
    canvas.setZoom(z);
    canvas.requestRenderAll();
  }, []);

  /* ---------------- Montage ---------------- */
  useEffect(() => {
    let disposed = false;
    let canvas: FabricCanvas | null = null;

    void (async () => {
      const { Canvas } = await import('fabric');
      if (disposed || !canvasElRef.current) return;

      canvas = new Canvas(canvasElRef.current, {
        preserveObjectStacking: true,
        selection: true,
        backgroundColor: 'transparent',
        controlsAboveOverlay: true,
      });
      canvasRef.current = canvas;

      canvas.on('selection:created', () => {
        setSelectedId(((canvas?.getActiveObject() as TaggedObject | undefined)?.layerId) ?? null);
      });
      canvas.on('selection:updated', () => {
        setSelectedId(((canvas?.getActiveObject() as TaggedObject | undefined)?.layerId) ?? null);
      });
      canvas.on('selection:cleared', () => {
        setSelectedId(null);
        setGuides({ v: false, h: false });
      });

      /* ---- Aimantation centrale : les seules lignes du produit ---- */
      canvas.on('object:moving', (event) => {
        const object = event.target;
        if (!object) return;

        const s = specRef.current;
        const center = object.getCenterPoint();
        const toleranceX = s.width * CENTER_SNAP;
        const toleranceY = s.height * CENTER_SNAP;
        const targetX = s.width / 2;
        const targetY = s.height / 2;

        let v = false;
        let h = false;
        if (Math.abs(center.x - targetX) < toleranceX) v = true;
        if (Math.abs(center.y - targetY) < toleranceY) h = true;

        if (v) object.set({ left: (object.left ?? 0) + (targetX - center.x) });
        if (h) object.set({ top: (object.top ?? 0) + (targetY - center.y) });
        if (v || h) object.setCoords();

        setGuides((previous) =>
          previous.v === v && previous.h === h ? previous : { v, h },
        );
      });

      canvas.on('object:modified', () => {
        setGuides({ v: false, h: false });
        emitFromCanvas();
      });
      canvas.on('object:added', () => {
        // Seuls les éléments ajoutés par l'utilisateur sont émis : ceux de la
        // reconstruction sont couverts par `lastEmitted`, et les émettre un par
        // un produirait un descripteur partiel.
        if (building.current) return;
        if (canvas?.getObjects().length) emitFromCanvas();
      });
      canvas.on('object:removed', () => {
        if (building.current) return;
        emitFromCanvas();
      });
      // Une frappe ne doit pas créer une entrée d'historique : on regroupe.
      canvas.on('text:changed', () => emitFromCanvas({ coalesce: true }));

      await buildObjects(descriptorRef.current);
      applyLocks();
      fitToView();

      onReady?.({
        fitToView,
        exportThumbnail: () => canvasRef.current?.toDataURL({ format: 'png', multiplier: 1 }) ?? null,
      });
    })();

    return () => {
      disposed = true;
      void canvas?.dispose();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Changement de ratio ---------------- */
  useEffect(() => {
    fitToView();
  }, [spec.width, spec.height, fitToView]);

  /* ---------------- Chargement externe d'un descripteur ---------------- */
  useEffect(() => {
    if (!canvasRef.current) return;
    const incoming = JSON.stringify(descriptor);
    if (incoming === lastEmitted.current) {
      // Même descripteur : seul le verrouillage a pu changer (annulation,
      // changement de zone). On le réapplique sans reconstruire la scène.
      applyLocks();
      return;
    }
    void buildObjects(descriptor).then(() => {
      setSelectedId(null);
      setGuides({ v: false, h: false });
      canvasRef.current?.discardActiveObject();
      applyLocks();
      canvasRef.current?.requestRenderAll();
    });
  }, [descriptor, buildObjects, applyLocks]);

  /* ---------------- Verrouillage ---------------- */
  useEffect(() => {
    applyLocks();
    if (locked && descriptorRef.current.photo_anchor === selectedId) {
      canvasRef.current?.discardActiveObject();
      setSelectedId(null);
    }
  }, [locked, applyLocks, selectedId]);

  /* ---------------- Aperçu : plus aucune poignée ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (preview) {
      canvas.discardActiveObject();
      setSelectedId(null);
      setGuides({ v: false, h: false });
    }
    canvas.selection = !preview;
    applyLocks();
    canvas.requestRenderAll();
  }, [preview, applyLocks]);

  /* ---------------- Redimensionnement de la fenêtre ---------------- */
  useEffect(() => {
    const onResize = () => fitToView();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitToView]);

  /* ---------------- Lecture de l'animation ---------------- */
  /**
   * Pendant la lecture, on anime les objets du canvas d'édition avec exactement
   * le même `sampleAt()` que l'export, et le même plan effectif
   * (`effectiveMotion`). À l'arrêt, chaque objet retrouve sa transformation
   * d'origine : la lecture ne modifie jamais le descripteur.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const plan = effectiveMotion(descriptor);
    const objects = canvas.getObjects();

    if (!playing || !plan || objects.length === 0) {
      if (baseTransforms.current.size > 0) {
        for (const [object, base] of baseTransforms.current) {
          object.set({
            left: base.left,
            top: base.top,
            scaleX: base.scaleX,
            scaleY: base.scaleY,
            angle: base.angle,
            opacity: base.opacity,
          });
          object.setCoords();
        }
        baseTransforms.current.clear();
        canvas.requestRenderAll();
      }
      return;
    }

    // Instantané des positions : c'est ce qui permet de revenir proprement.
    baseTransforms.current = new Map(
      objects.map((object) => [
        object,
        {
          left: object.left ?? 0,
          top: object.top ?? 0,
          scaleX: object.scaleX ?? 1,
          scaleY: object.scaleY ?? 1,
          angle: object.angle ?? 0,
          opacity: object.opacity ?? 1,
        },
      ]),
    );

    const sortedLayers = [...descriptor.layers].sort((a, b) => a.z - b.z);
    const start = performance.now();
    let frame = 0;

    const tick = () => {
      const elapsed = performance.now() - start;
      objects.forEach((object, index) => {
        const base = baseTransforms.current.get(object);
        if (!base) return;
        const layer = sortedLayers[index];
        const transform = sampleAt(
          plan,
          index,
          elapsed,
          layer?.w ?? spec.width,
          layer?.h ?? spec.height,
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
      canvas.requestRenderAll();
      // La boucle s'arrête sur la dernière image : l'aperçu fige le résultat.
      if (elapsed < plan.durationMs) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Seuls comptent le fait de jouer, le plan d'animation et l'identité du
    // calque qui délimite la zone photo — c'est tout ce dont `effectiveMotion`
    // dépend pour choisir les mouvements réellement joués.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, descriptor.motion, descriptor.photo_anchor, spec.width, spec.height]);

  /* ---------------- Raccourcis clavier ---------------- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && ['INPUT', 'TEXTAREA'].includes(target.tagName);

      // Annuler / rétablir : même au-dessus du canvas, jamais pendant une saisie.
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        if (typing) return;
        event.preventDefault();
        if (event.shiftKey) onRedo?.();
        else onUndo?.();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        if (typing) return;
        event.preventDefault();
        onRedo?.();
        return;
      }

      if (typing) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (preview) return;

      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;
      // On ne supprime pas pendant l'édition d'un texte.
      if ((active as unknown as { isEditing?: boolean }).isEditing) return;

      event.preventDefault();
      canvas.remove(active);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      setSelectedId(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onUndo, onRedo, preview]);

  /* ---------------- Ajout d'éléments ---------------- */

  /**
   * Vrai quand la formule interdit d'ajouter un élément de plus.
   *
   * La limite porte sur l'AJOUT, jamais sur l'existant : un cadre composé avant
   * le verrouillage garde tous ses éléments. On ne détruit pas le travail d'un
   * créateur pour lui vendre un module.
   */
  const layerLimitReached = maxLayers !== null && descriptor.layers.length >= maxLayers;

  async function addImageFile(file: File | undefined) {
    if (!file) return;
    if (layerLimitReached) {
      setError(`La formule Free limite à ${maxLayers} éléments par cadre.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const uploaded = await backend.uploadImage(file, 'frames');
      if (uploaded.error || !uploaded.data) {
        setError(uploaded.error ?? 'Import impossible.');
        return;
      }
      const src = uploaded.data;

      // Dimensions naturelles pour centrer l'élément sans le déformer.
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const probe = new window.Image();
        probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight });
        probe.onerror = () => resolve({ w: spec.width, h: spec.height });
        probe.src = src;
      });

      const maxW = spec.width * 0.8;
      const maxH = spec.height * 0.8;
      const ratio = dims.w / dims.h;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }

      const { makeImageLayer } = await import('@/lib/descriptor');
      const layer = makeImageLayer(src, descriptor.ratio, {
        w,
        h,
        x: Math.round((spec.width - w) / 2),
        y: Math.round((spec.height - h) / 2),
        z: descriptor.layers.length * 10 + 10,
        label: file.name,
      });

      const next = { ...descriptor, layers: [...descriptor.layers, layer] };
      await buildObjects(next);
      applyLocks();
      setSelectedId(layer.id);
      setTab('cadre');
      onChange(next);
    } finally {
      setBusy(false);
    }
  }

  async function addText() {
    if (layerLimitReached) {
      setError(`La formule Free limite à ${maxLayers} éléments par cadre.`);
      return;
    }
    const { makeTextLayer } = await import('@/lib/descriptor');
    const layer = makeTextLayer('Votre texte', descriptor.ratio, {
      size: Math.round(spec.width * 0.09),
      z: descriptor.layers.length * 10 + 10,
    });
    const next = { ...descriptor, layers: [...descriptor.layers, layer] };
    await buildObjects(next);
    applyLocks();
    setSelectedId(layer.id);
    setTab('cadre');
    onChange(next);
  }

  /* ---------------- Actions sur l'élément sélectionné ---------------- */
  const patchSelected = useCallback(
    (patch: LayerPatch) => {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject() as
        | (FabricObject & {
            text?: string;
            fontFamily?: string;
            fontSize?: number;
            fill?: unknown;
            textAlign?: string;
          })
        | undefined;
      if (!canvas || !active) return;

      if (patch.opacity !== undefined) active.set({ opacity: patch.opacity });
      if (patch.rotation !== undefined) active.set({ angle: patch.rotation });
      if (patch.w !== undefined || patch.h !== undefined) {
        const targetW = patch.w ?? active.getScaledWidth();
        const targetH = patch.h ?? active.getScaledHeight();
        const naturalW = active.width ?? targetW;
        const naturalH = active.height ?? targetH;
        if (naturalW > 0) active.set({ scaleX: targetW / naturalW });
        if (naturalH > 0) active.set({ scaleY: targetH / naturalH });
      }
      if ((active as TaggedObject).layerKind === 'text') {
        if (patch.text !== undefined) active.set({ text: patch.text });
        if (patch.font !== undefined) active.set({ fontFamily: patch.font });
        if (patch.size !== undefined) active.set({ fontSize: patch.size });
        if (patch.color !== undefined) active.set({ fill: patch.color });
        if (patch.align !== undefined) active.set({ textAlign: patch.align });
        if (patch.weight !== undefined) active.set({ fontWeight: patch.weight === 'bold' ? 'bold' : 'normal' });
        // Fabric ne recompose pas la boîte de texte de lui-même : sans
        // `initDimensions()`, le texte garderait son ancienne largeur jusqu'au
        // prochain rebuild — et le panneau semblerait ne rien faire.
        (active as unknown as { initDimensions?: () => void }).initDimensions?.();
      }

      active.setCoords();
      canvas.requestRenderAll();
      // Les réglages arrivent par gestes continus (curseur, frappe) : on
      // regroupe, sinon « annuler » reviendrait pixel par pixel.
      emitFromCanvas({ coalesce: true });
    },
    [emitFromCanvas],
  );

  const deleteSelected = useCallback(() => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    canvas.remove(active);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setSelectedId(null);
  }, []);

  const moveSelected = useCallback(
    (direction: 'front' | 'back') => {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;
      if (direction === 'front') canvas.bringObjectToFront(active);
      else canvas.sendObjectToBack(active);
      canvas.requestRenderAll();
      emitFromCanvas();
    },
    [emitFromCanvas],
  );

  const selectedLayer = descriptor.layers.find((l) => l.id === selectedId) ?? null;
  const zoneLayer = descriptor.layers.find((l) => l.id === descriptor.photo_anchor) ?? null;

  /**
   * Désigne — ou retire — la zone du participant. Une seule à la fois : le
   * descripteur ne porte qu'une ancre, donc désigner un calque remplace le
   * précédent.
   */
  const setPhotoZone = useCallback(
    (layerId: string | null) => {
      onChange({ ...descriptor, photo_anchor: layerId ?? undefined });
    },
    [descriptor, onChange],
  );

  function changeRatio(ratio: Descriptor['ratio']) {
    onChange({ ...descriptor, ratio });
  }

  /* ---------------- Panneau contextuel ---------------- */
  const panel = tab === 'animation' ? (
    <AnimationPanel
      descriptor={descriptor}
      onChange={(next) => onChange(next)}
      playing={playing}
      onPlayingChange={(value) => {
        onPreviewChange?.(value);
      }}
      plan={plan}
      campaignName={campaignName}
    />
  ) : selectedLayer ? (
    <LayerPanel
      layer={selectedLayer}
      ratio={descriptor.ratio}
      isZone={descriptor.photo_anchor === selectedLayer.id}
      otherZone={zoneLayer && zoneLayer.id !== selectedLayer.id ? zoneLayer : null}
      onPatch={patchSelected}
      onDelete={deleteSelected}
      onOrder={moveSelected}
      onToggleZone={() =>
        setPhotoZone(descriptor.photo_anchor === selectedLayer.id ? null : selectedLayer.id)
      }
    />
  ) : (
    <FramePanel
      descriptor={descriptor}
      kind={kind}
      maxLayers={maxLayers}
      onAddImage={() => fileInputRef.current?.click()}
      onAddText={() => void addText()}
      onChangeRatio={changeRatio}
      busy={busy}
      locked={locked}
      onToggleLock={() => setLocked((v) => !v)}
    />
  );

  /* ---------------- Barre d'outils ---------------- */
  const toolbar = (
    <>
      <ToolButton
        compact
        icon={<FrameIcon className="size-[18px]" strokeWidth={1.75} />}
        label="Mon cadre"
        active={tab === 'cadre'}
        onClick={() => {
          setTab('cadre');
          if (isCompactViewport()) setSheet(true);
        }}
      />
      <ToolButton
        compact
        icon={<Sparkles className="size-[18px]" strokeWidth={1.75} />}
        label="Animation"
        active={tab === 'animation'}
        onClick={() => {
          setTab('animation');
          if (isCompactViewport()) setSheet(true);
        }}
      />
    </>
  );

  const historyButtons = (
    <>
      <ToolButton
        compact
        icon={<Undo2 className="size-[18px]" strokeWidth={1.75} />}
        label="Annuler"
        disabled={!canUndo}
        onClick={() => onUndo?.()}
      />
      <ToolButton
        compact
        icon={<Redo2 className="size-[18px]" strokeWidth={1.75} />}
        label="Rétablir"
        disabled={!canRedo}
        onClick={() => onRedo?.()}
      />
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- Barre supérieure ---------------- */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">{historyButtons}</div>

        <Button
          variant={preview ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onPreviewChange?.(!preview)}
        >
          <Eye className="size-4" strokeWidth={1.75} aria-hidden />
          {preview ? 'Reprendre l’édition' : 'Aperçu'}
        </Button>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:gap-5">
        {/* ---------------- Rail (tablette et bureau) ---------------- */}
        {!preview && (
          <nav
            aria-label="Outils de l’éditeur"
            className="hidden shrink-0 flex-col gap-1 md:flex"
          >
            {toolbar}
            <span className="my-1 h-px bg-gray-200" />
            {historyButtons}
          </nav>
        )}

        {/* ---------------- Scène ---------------- */}
        <div className="min-w-0 flex-1">
          <div
            ref={stageRef}
            onDragOver={(e) => {
              e.preventDefault();
              if (!preview) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!preview) void addImageFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              'relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-lg border bg-gray-100 p-4 transition-colors md:min-h-[380px]',
              dragging ? 'border-purple bg-purple/5' : 'border-gray-200',
            )}
          >
            {/* Damier discret : matérialise la transparence du cadre. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.5]"
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%), linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 8px 8px',
              }}
            />

            <div className="relative shadow-md" style={{ lineHeight: 0 }}>
              <canvas ref={canvasElRef} role="img" aria-label="Cadre en cours d’édition" />

              {/*
                Guides de centrage. Dessinés en surimpression, jamais sur le
                canvas : ils ne doivent pas se retrouver dans un export.
              */}
              {guides.v && !preview && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-purple"
                />
              )}
              {guides.h && !preview && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-purple"
                />
              )}
            </div>

            {dragging && !preview && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70">
                <span className="rounded-pill bg-ink px-4 py-2 text-[13px] font-medium text-white">
                  Déposez votre image
                </span>
              </div>
            )}

            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <Loader2 className="size-5 animate-spin text-gray-500" aria-hidden />
              </div>
            )}
          </div>

          {!preview && (
            <p className="mt-3 text-center text-[12px] leading-relaxed text-gray-500">
              Glissez une image sur la scène, déplacez-la, redimensionnez-la. Le centre s’aligne
              tout seul. Supprimez avec la touche{' '}
              <kbd className="mx-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">
                Suppr
              </kbd>
            </p>
          )}

          {error && (
            <p role="alert" className="mt-2 text-center text-[12px] text-error">
              {error}
            </p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => void addImageFile(e.target.files?.[0])}
          />
        </div>

        {/* ---------------- Panneau contextuel (tablette et bureau) ---------------- */}
        {!preview && (
          <aside className="hidden w-72 shrink-0 md:block xl:w-80">
            <div className="rounded-lg border border-gray-200 bg-white p-4">{panel}</div>
          </aside>
        )}
      </div>

      {/* ---------------- Barre du bas (mobile) ---------------- */}
      {!preview && (
        <div className="sticky bottom-0 z-20 flex items-center justify-around gap-1 rounded-lg border border-gray-200 bg-white/95 px-2 py-2 backdrop-blur md:hidden">
          {toolbar}
          {historyButtons}
        </div>
      )}

      {/* ---------------- Feuille du bas (mobile) ---------------- */}
      <Drawer
        open={sheet && !preview}
        onClose={() => setSheet(false)}
        side="bottom"
        title={tab === 'animation' ? 'Animation' : 'Mon cadre'}
      >
        {panel}
      </Drawer>
    </div>
  );
}
