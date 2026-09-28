'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, FabricObject } from 'fabric';
import { ImagePlus, Loader2, Trash2, Type } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ratioSpec } from '@/lib/ratios';
import { parseDescriptor } from '@/lib/descriptor';
import { sampleAt } from '@/lib/motion';
import { backend } from '@/lib/backend';
import type { Descriptor, ImageLayer, Layer, TextAlign, TextLayer } from '@/lib/types';

/* ------------------------------------------------------------------ */
/* Pont descripteur ⇄ objets Fabric                                    */
/* ------------------------------------------------------------------ */

type TaggedObject = FabricObject & {
  layerId?: string;
  layerKind?: 'image' | 'text';
  layerSrc?: string;
};

/**
 * Le canvas travaille dans le repère NATIF du ratio (1080×1920, …) et n'est
 * réduit à l'écran que par `setZoom`. Les coordonnées du descripteur sont donc
 * indépendantes de la taille d'affichage : c'est ce qui rend le cadre rejouable
 * à l'identique sur un autre écran, et demain côté participant.
 */
export function FrameEditor({
  descriptor,
  onChange,
  onReady,
  playing = false,
}: {
  descriptor: Descriptor;
  onChange: (next: Descriptor) => void;
  onReady?: (api: { fitToView: () => void; exportThumbnail: () => string | null }) => void;
  /** Lecture de l'animation. L'édition reprend la main dès que le drapeau retombe. */
  playing?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<FabricCanvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Dernier JSON émis par l'éditeur : évite de se recharger soi-même. */
  const lastEmitted = useRef<string>('');
  const descriptorRef = useRef(descriptor);
  descriptorRef.current = descriptor;

  /** Transformations d'origine, mémorisées pendant la lecture de l'animation. */
  const baseTransforms = useRef<
    Map<FabricObject, { left: number; top: number; scaleX: number; scaleY: number; angle: number; opacity: number }>
  >(new Map());

  const [zoom, setZoom] = useState(0.3);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spec = useMemo(() => ratioSpec(descriptor.ratio), [descriptor.ratio]);

  /* ---------------- Émission vers le parent ---------------- */
  const emitFromCanvas = useCallback(() => {
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
        };
        const align: TextAlign =
          t.textAlign === 'left' || t.textAlign === 'right' ? t.textAlign : 'center';
        const layer: TextLayer = {
          ...base,
          type: 'text',
          text: t.text ?? '',
          font: t.fontFamily ?? 'Inter',
          size: Math.round(t.fontSize ?? 96),
          color: typeof t.fill === 'string' ? t.fill : '#FFFFFF',
          align,
        };
        return layer;
      }

      const layer: ImageLayer = { ...base, type: 'image', src: obj.layerSrc ?? '' };
      return layer;
    });

    const next: Descriptor = { ...descriptorRef.current, layers };
    lastEmitted.current = JSON.stringify(next);
    onChange(next);
  }, [onChange]);

  /* ---------------- Construction des objets ---------------- */
  const buildObjects = useCallback(
    async (source: Descriptor) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { FabricImage, IText } = await import('fabric');

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
          setError("Un calque n'a pas pu être affiché.");
        }
      }

      canvas.requestRenderAll();
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

    const maxHeight = window.innerWidth < 768 ? 360 : 520;
    const z = Math.min(available / spec.width, maxHeight / spec.height);
    setZoom(z);
    canvas.setDimensions({ width: Math.round(spec.width * z), height: Math.round(spec.height * z) });
    canvas.setZoom(z);
    canvas.requestRenderAll();
  }, [spec.height, spec.width]);

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
      canvas.on('selection:cleared', () => setSelectedId(null));

      canvas.on('object:modified', emitFromCanvas);
      canvas.on('object:added', () => {
        // Les calques ajoutés par l'utilisateur sont émis ; ceux du chargement
        // initial le sont explicitement après construction.
        if (canvas?.getObjects().length) emitFromCanvas();
      });
      canvas.on('object:removed', emitFromCanvas);
      canvas.on('text:changed', emitFromCanvas);

      await buildObjects(descriptorRef.current);
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
    if (incoming === lastEmitted.current) return;
    void buildObjects(descriptor).then(() => {
      setSelectedId(null);
      canvasRef.current?.discardActiveObject();
      canvasRef.current?.requestRenderAll();
    });
  }, [descriptor, buildObjects]);

  /* ---------------- Redimensionnement de la fenêtre ---------------- */
  useEffect(() => {
    const onResize = () => fitToView();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitToView]);

  /* ---------------- Lecture de l'animation ---------------- */
  /**
   * Pendant la lecture, on anime les objets du canvas d'édition avec exactement
   * le même `sampleAt()` que l'export. À l'arrêt, chaque objet retrouve sa
   * transformation d'origine : la lecture ne modifie jamais le descripteur.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const plan = descriptor.motion ?? null;
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
        canvas.selection = true;
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

    canvas.discardActiveObject();
    canvas.selection = false;

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
    // `descriptor.motion` est volontairement la seule dépendance qui compte ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, descriptor.motion, spec.width, spec.height]);

  /* ---------------- Suppression au clavier ---------------- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;

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
  }, []);

  /* ---------------- Ajout de calques ---------------- */
  async function addImageFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const uploaded = await backend.uploadImage(file, 'frames');
      if (uploaded.error || !uploaded.data) {
        setError(uploaded.error ?? 'Import impossible.');
        return;
      }
      const src = uploaded.data;

      // Dimensions naturelles pour centrer le calque sans le déformer.
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
      });

      await buildObjects({ ...descriptor, layers: [...descriptor.layers, layer] });
      setSelectedId(layer.id);
      onChange({ ...descriptor, layers: [...descriptor.layers, layer] });
    } finally {
      setBusy(false);
    }
  }

  async function addText() {
    const { makeTextLayer } = await import('@/lib/descriptor');
    const layer = makeTextLayer('Votre texte', descriptor.ratio, {
      size: Math.round(spec.width * 0.09),
      z: descriptor.layers.length * 10 + 10,
    });
    const next = { ...descriptor, layers: [...descriptor.layers, layer] };
    await buildObjects(next);
    setSelectedId(layer.id);
    onChange(next);
  }

  /* ---------------- Actions sur le calque sélectionné ---------------- */
  const patchSelected = useCallback(
    (patch: Partial<TextLayer> & Partial<ImageLayer>) => {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject() as
        | (FabricObject & {
            fontFamily?: string;
            fontSize?: number;
            fill?: unknown;
            textAlign?: string;
          })
        | undefined;
      if (!canvas || !active) return;

      if (patch.opacity !== undefined) active.set({ opacity: patch.opacity });
      if (patch.rotation !== undefined) active.set({ angle: patch.rotation });
      if (patch.type === 'text' || (active as TaggedObject).layerKind === 'text') {
        if (patch.font !== undefined) active.set({ fontFamily: patch.font });
        if (patch.size !== undefined) active.set({ fontSize: patch.size });
        if (patch.color !== undefined) active.set({ fill: patch.color });
        if (patch.align !== undefined) active.set({ textAlign: patch.align });
      }

      active.setCoords();
      canvas.requestRenderAll();
      emitFromCanvas();
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

  const moveSelected = useCallback((direction: 'front' | 'back') => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active) return;
    if (direction === 'front') canvas.bringObjectToFront(active);
    else canvas.sendObjectToBack(active);
    canvas.requestRenderAll();
    emitFromCanvas();
  }, [emitFromCanvas]);

  const selectedLayer = descriptor.layers.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      {/* ---------------- Scène ---------------- */}
      <div className="min-w-0 flex-1">
        <div
          ref={stageRef}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addImageFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            'relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-lg border bg-gray-100 p-4 transition-colors',
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
            <canvas ref={canvasElRef} />
          </div>

          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="size-5 animate-spin text-gray-500" aria-hidden />
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-gray-500">
          Glissez une image, déplacez-la, redimensionnez-la. Supprimez avec la touche
          <kbd className="mx-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">
            Suppr
          </kbd>
        </p>

        {error && <p className="mt-2 text-center text-xs text-error">{error}</p>}
      </div>

      {/* ---------------- Panneau d'actions ---------------- */}
      <aside className="w-full shrink-0 lg:w-72">
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <span className="text-[13px] font-semibold text-gray-700">Ajouter</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex flex-col items-center gap-2 rounded-md border border-gray-200 py-4 text-[13px] transition-colors hover:border-ink disabled:opacity-50"
            >
              <ImagePlus className="size-5" strokeWidth={1.75} aria-hidden />
              Image
            </button>
            <button
              type="button"
              onClick={() => void addText()}
              className="flex flex-col items-center gap-2 rounded-md border border-gray-200 py-4 text-[13px] transition-colors hover:border-ink"
            >
              <Type className="size-5" strokeWidth={1.75} aria-hidden />
              Texte
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => void addImageFile(e.target.files?.[0])}
          />

          <div className="h-px bg-gray-200" />

          {selectedLayer ? (
            <LayerInspector
              layer={selectedLayer}
              onPatch={patchSelected}
              onDelete={deleteSelected}
              onOrder={moveSelected}
            />
          ) : (
            <p className="py-4 text-center text-[13px] leading-relaxed text-gray-500">
              Sélectionnez un élément sur le cadre pour le modifier.
            </p>
          )}
        </div>

        <p className="mt-3 px-1 text-xs text-gray-400">
          Repère du cadre : {spec.width} × {spec.height} · zoom {Math.round(zoom * 100)} %
        </p>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inspecteur — replié derrière ••• pour ne pas exposer un panneau      */
/* de configuration complexe (§13 et règle UX n°2).                    */
/* ------------------------------------------------------------------ */

function LayerInspector({
  layer,
  onPatch,
  onDelete,
  onOrder,
}: {
  layer: Layer;
  onPatch: (patch: Partial<TextLayer> & Partial<ImageLayer>) => void;
  onDelete: () => void;
  onOrder: (direction: 'front' | 'back') => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const isText = layer.type === 'text';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-gray-700">
          {isText ? 'Calque texte' : 'Calque image'}
        </span>
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
          className="rounded-sm px-2 py-1 text-xs text-gray-500 transition-colors hover:text-ink"
        >
          •••
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onOrder('front')}
          className="rounded-md border border-gray-200 py-2 text-[13px] transition-colors hover:border-ink"
        >
          Devant
        </button>
        <button
          type="button"
          onClick={() => onOrder('back')}
          className="rounded-md border border-gray-200 py-2 text-[13px] transition-colors hover:border-ink"
        >
          Derrière
        </button>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="flex items-center justify-center gap-2 rounded-md border border-error/30 py-2 text-[13px] text-error transition-colors hover:bg-error hover:text-white"
      >
        <Trash2 className="size-3.5" strokeWidth={1.75} aria-hidden />
        Supprimer
      </button>

      {advanced && (
        <div className="flex flex-col gap-4 rounded-md border border-gray-200 bg-gray-50 p-3">
          {isText && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-700">Taille</span>
                <input
                  type="range"
                  min={16}
                  max={400}
                  step={2}
                  value={layer.size}
                  onChange={(e) => onPatch({ size: Number(e.target.value) })}
                  className="accent-purple"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-700">Couleur</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={layer.color}
                    onChange={(e) => onPatch({ color: e.target.value })}
                    className="h-8 w-12 cursor-pointer rounded-sm border border-gray-200 bg-white"
                  />
                  <span className="font-mono text-xs text-gray-500">{layer.color}</span>
                </div>
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-700">Alignement</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['left', 'center', 'right'] as TextAlign[]).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => onPatch({ align })}
                      aria-pressed={layer.align === align}
                      className={cn(
                        'rounded-sm border py-1.5 text-xs transition-colors',
                        layer.align === align
                          ? 'border-ink bg-ink text-white'
                          : 'border-gray-200 bg-white hover:border-ink',
                      )}
                    >
                      {align === 'left' ? 'Gauche' : align === 'center' ? 'Centre' : 'Droite'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-700">
              Opacité — {Math.round(layer.opacity * 100)} %
            </span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={layer.opacity}
              onChange={(e) => onPatch({ opacity: Number(e.target.value) })}
              className="accent-purple"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-700">
              Rotation — {layer.rotation}°
            </span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={layer.rotation}
              onChange={(e) => onPatch({ rotation: Number(e.target.value) })}
              className="accent-purple"
            />
          </label>
        </div>
      )}
    </div>
  );
}

export { parseDescriptor };
