'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, FabricObject } from 'fabric';
import {
  Eye,
  Frame as FrameIcon,
  Layers as LayersIcon,
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
import { TemplatesModal } from '@/components/editor/templates-modal';
import { LayersPanel } from '@/components/editor/layers-panel';
import { applyTemplate, type FrameTemplate } from '@/lib/templates';
import { cn } from '@/lib/cn';
import { ratioSpec } from '@/lib/ratios';
import { DEFAULT_LINE_HEIGHT, effectiveMotion, makeLayerId, nextZ } from '@/lib/descriptor';
import { applyCurve, bakeTextScale, createTextObject } from '@/lib/fabric-text';
import { applyShapePaint, createShapeObject } from '@/lib/fabric-shape';
import { shapeSpec } from '@/lib/shapes';



import { sampleAt } from '@/lib/motion';
import { backend } from '@/lib/backend';
import type {
  CampaignKind,
  Descriptor,
  ImageLayer,
  Layer,
  ShapeKind,
  ShapeLayer,
  TextAlign,
  TextLayer,
  VerticalAlign,
} from '@/lib/types';
import { PLANS, PREMIUM_MODULES, hasFeature, type PlanId } from '@/lib/plans';

/* ------------------------------------------------------------------ */
/* Pont descripteur ⇄ objets Fabric                                    */
/* ------------------------------------------------------------------ */

type TaggedObject = FabricObject & {
  layerId?: string;
  layerKind?: 'image' | 'text' | 'shape';
  layerSrc?: string;
  /** Courbure appliquée au texte — Fabric ne la porte pas lui-même. */
  layerCurve?: number;
  /**
   * Verrou posé par le créateur sur ce calque.
   *
   * Il vit sur l'objet Fabric plutôt que dans le descripteur relu : c'est un
   * réglage d'interface, pas une propriété du visuel. Un calque verrouillé
   * reste sélectionnable — on doit pouvoir le déverrouiller — mais ne se
   * déplace ni ne redimensionne pas.
   */
  layerLocked?: boolean;
  /**
   * Réglages d'une forme (nature, teinte, contour, arrondi).
   *
   * Ils vivent sur l'objet plutôt que d'être relus du canvas : Fabric ne sait
   * pas qu'un polygone est une « étoile », et l'arrondi d'un `Rect` s'exprime
   * dans son repère local, donc pas dans les mêmes unités que le descripteur.
   * La géométrie (position, taille, rotation), elle, reste lue du canvas.
   */
  layerShape?: ShapeLayer;
};

/** Seuil d'aimantation vers le centre, en fraction de la dimension du cadre. */
const CENTER_SNAP = 0.015;

type Tab = 'cadre' | 'calques' | 'animation';

/** Le titre de la feuille mobile suit l'onglet : un seul endroit à tenir à jour. */
const TAB_TITLES: Record<Tab, string> = {
  cadre: 'Mon cadre',
  calques: 'Calques',
  animation: 'Animation',
};

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
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const [locked, setLocked] = useState(true);
  /**
   * Identifiant du texte en cours d'édition **sur le canvas**.
   *
   * Ce n'est pas un réglage du descripteur : c'est un état d'interface, comme
   * la sélection. Il sert à faire apparaître le bouton « Valider », qui referme
   * l'édition — sans lui, un texte édité à la souris ne pourrait se terminer
   * qu'en cliquant ailleurs, ce qui n'est dit nulle part.
   */
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  /** Modèles : ouverts depuis le panneau « Mon cadre ». */
  

  /**
   * Ouvre l'édition d'un texte directement sur le visuel.
   *
   * `enterEditing()` de Fabric exige que l'objet soit l'élément actif **et**
   * visible : on le sélectionne, on sort du panneau le temps de la frappe, puis
   * on ouvre l'édition. Le `requestAnimationFrame` laisse passer le rendu du
   * calque qui vient d'être ajouté — sans lui, Fabric tenterait d'entrer en
   * édition sur un objet pas encore peint, et la saisie ne prendrait pas.
   */
  const focusTextForEditing = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const object = (canvas.getObjects() as TaggedObject[]).find((obj) => obj.layerId === id);
      if (!object || object.layerKind !== 'text' || object.visible === false) return;
      canvas.setActiveObject(object);
      (object as unknown as { enterEditing: () => void }).enterEditing();
      // Le curseur doit clignoter au bon endroit : on sélectionne le contenu
      // existant pour qu'une frappe le remplace, comme dans un champ de saisie.
      (object as unknown as { selectAll?: () => void }).selectAll?.();
      canvas.requestRenderAll();
      setEditingTextId(id);
    });
  }, []);

  /** Referme l'édition en cours — le geste du bouton « Valider ». */
  const commitTextEditing = useCallback(() => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject() as TaggedObject | undefined;
    if (canvas && active) {
      const typing = active as unknown as { isEditing?: boolean; exitEditing?: () => void };
      if (typing.isEditing) typing.exitEditing?.();
    }
    setEditingTextId(null);
    canvas?.requestRenderAll();
  }, []);

  /* ---------------- Émission vers le parent ---------------- */
  const emitFromCanvas = useCallback(
    (opts?: { coalesce?: boolean }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const objects = canvas.getObjects() as TaggedObject[];
      const layers: Layer[] = objects.map((obj, index) => {
        /*
         * Visibilité et verrou ne sont **pas** dessinés : ils ne se relisent
         * pas sur l'objet comme la géométrie. On les reprend donc sur le
         * descripteur courant, par identifiant. Sans cela, le moindre glissement
         * d'un calque masqué le ferait réapparaître — le réglage serait perdu au
         * premier geste, sans jamais avoir été annulé.
         */
        const settings = descriptorRef.current.layers.find(
          (layer) => layer.id === (obj.layerId ?? `l${index}`),
        );

        const base = {
          id: obj.layerId ?? `l${index}`,
          x: Math.round(obj.left ?? 0),
          y: Math.round(obj.top ?? 0),
          w: Math.round(obj.getScaledWidth()),
          h: Math.round(obj.getScaledHeight()),
          rotation: Math.round(obj.angle ?? 0),
          z: (index + 1) * 10,
          opacity: Number((obj.opacity ?? 1).toFixed(2)),
          ...(settings?.visible === false ? { visible: false } : {}),
          ...(settings?.locked ? { locked: true } : {}),
        };

        if (obj.layerKind === 'shape') {
          // La géométrie vient du canvas, les réglages de l'objet : une forme
          // déplacée à la main doit remonter sa nouvelle position, mais son
          // arrondi ne se relit pas d'un `Rect`.
          const settings = (obj as TaggedObject).layerShape;
          const layer: ShapeLayer = {
            ...base,
            /*
             * `getScaledWidth()` ajoute l'épaisseur du contour à la boîte — sur
             * une forme, elle ferait donc grossir le calque à chaque
             * reconstruction, indéfiniment. On lit la géométrie nue : la boîte
             * du descripteur est celle de la forme, pas celle de son liseré.
             */
            w: Math.round((obj.width ?? base.w) * (obj.scaleX ?? 1)),
            h: Math.round((obj.height ?? base.h) * (obj.scaleY ?? 1)),
            type: 'shape',
            kind: settings?.kind ?? 'rect',
            fill: settings?.fill ?? '#FFFFFF',
            stroke: settings?.stroke ?? 'transparent',
            strokeWidth: settings?.strokeWidth ?? 0,
            radius: settings?.radius ?? 0,
          };
          return layer;
        }

        if (obj.layerKind === 'text') {
          const t = obj as FabricObject & {
            text?: string;
            fontFamily?: string;
            fontSize?: number;
            fill?: unknown;
            textAlign?: string;
            fontWeight?: string | number;
            fontStyle?: string;
            charSpacing?: number;
            lineHeight?: number;
          };
          const align: TextAlign =
            t.textAlign === 'left' || t.textAlign === 'right' ? t.textAlign : 'center';
          const font = (t.fontFamily ?? 'Inter') as TextLayer['font'];
          const weight: TextLayer['weight'] =
            t.fontWeight === 'bold' || t.fontWeight === 700 ? 'bold' : 'normal';
          const style: TextLayer['style'] = t.fontStyle === 'italic' ? 'italic' : 'normal';

          /*
           * Un texte étiré par ses poignées porte une **échelle**, pas un corps :
           * Fabric change `scaleX` et laisse `fontSize` intact. Or le descripteur
           * ne connaît que `size`, donc sans ce repli le texte revenait à son
           * corps d'origine au rechargement — un texte agrandi ×2 retombait à
           * 100 %. Le repli remet l'échelle dans le corps et rend la boîte, sans
           * bouger de ce que l'utilisateur regarde.
           */
          const repli = bakeTextScale(t);

          const layer: TextLayer = {
            ...base,
            type: 'text',
            text: t.text ?? '',
            font,
            size: repli.fontSize,
            w: repli.width,
            h: repli.height,
            color: typeof t.fill === 'string' ? t.fill : '#FFFFFF',
            align,
            weight,
            style,
            letterSpacing: Math.round(t.charSpacing ?? 0),
            lineHeight: Number((t.lineHeight ?? DEFAULT_LINE_HEIGHT).toFixed(2)),
            curve: (obj as TaggedObject).layerCurve ?? 0,
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
      // Deux verrous distincts, qui se cumulent : celui du créateur sur le
      // calque lui-même, et celui, structurel, de la zone participant.
      // Un calque masqué est de surcroît inatteignable au pointeur : on ne
      // sélectionne pas ce qu'on ne voit pas.
      const lock =
        (locked && isZone) || (obj as TaggedObject).layerLocked === true || obj.visible === false;
      obj.set({
        selectable: interactive && !lock,
        evented: interactive && !lock,
        hasControls: interactive && !lock,
        hoverCursor: interactive && !lock ? 'move' : 'default',
      });
    }
    canvas.requestRenderAll();
  }, [locked, preview]);

  /**
   * Rend un calque réellement actif sur le canevas, à partir de son identifiant.
   *
   * `buildObjects()` reconstruit la scène de zéro, et `canvas.clear()` efface
   * au passage l'élément actif. Sans ce rattrapage, le panneau de réglages
   * s'ouvrirait sur un calque que Fabric ne considère plus comme sélectionné :
   * `patchSelected` sortirait aussitôt, et la forme qu'on vient de poser
   * semblerait insensible à tous les réglages — couleur, contour, nature —
   * alors qu'elle est simplement inatteignable.
   *
   * On ne rend actif que ce que l'utilisateur peut attraper : un calque masqué
   * resterait un piège, le panneau afficherait des réglages sans prise.
   */
  const selectOnCanvas = useCallback((id: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!id) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      return;
    }
    const object = (canvas.getObjects() as TaggedObject[]).find((obj) => obj.layerId === id);
    if (!object || object.visible === false) return;
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
  }, []);

  /* ---------------- Construction des objets ---------------- */
  const buildObjects = useCallback(
    async (source: Descriptor) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { FabricImage, Rect } = await import('fabric');

      building.current = true;
      canvas.clear();
      canvas.backgroundColor = 'transparent';
      /*
       * Masque au bord exact du format : ce qui déborde n'existe pas pour le
       * participant, donc pas pour l'export non plus. `fill` doit peindre —
       * une chaîne vide laisse la cache vide, et Fabric découperait alors la
       * scène entière.
       *
       * Il est recréé à chaque reconstruction parce que `clear()` ne touche
       * pas `clipPath` : le masque suivrait sinon l'ancien format après un
       * changement de ratio.
       */
      const frame = specRef.current;
      canvas.clipPath = new Rect({
        left: 0,
        top: 0,
        width: frame.width,
        height: frame.height,
        originX: 'left',
        originY: 'top',
        strokeWidth: 0,
        fill: '#000',
        selectable: false,
        evented: false,
      });

      for (const layer of [...source.layers].sort((a, b) => a.z - b.z)) {
        try {
          if (layer.type === 'shape') {
            const shape = await createShapeObject(layer, source.ratio, { interactive: true });
            const tagged = shape as TaggedObject;
            tagged.layerId = layer.id;
            tagged.layerKind = 'shape';
            tagged.layerShape = layer;
            /*
             * Un calque masqué n'est pas seulement invisible : il ne se
             * sélectionne pas au pointeur. Le cas échéant, on ne pourrait plus
             * le rattraper pour le remasquer — l'onglet Calques devient le seul
             * chemin de sortie, ce qui n'est pas une issue en soi, mais autant
             * que l'état soit cohérent avec ce qu'il promet.
             */
            shape.set({ visible: layer.visible !== false } as never);
            tagged.layerLocked = layer.locked === true;
            canvas.add(shape);
          } else if (layer.type === 'text') {
            const text = await createTextObject(layer, { interactive: true });
            const tagged = text as TaggedObject;
            tagged.layerId = layer.id;
            tagged.layerKind = 'text';
            tagged.layerCurve = layer.curve;
            text.set({ visible: layer.visible !== false } as never);
            tagged.layerLocked = layer.locked === true;
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
            img.set({ visible: layer.visible !== false } as never);
            tagged.layerLocked = layer.locked === true;
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

    /*
     * L'espace utile se lit dans le CSS plutôt que dans une constante : le
     * paddings de la zone change avec le breakpoint, et un chiffre en dur
     * ferait déborder le cadre sur mobile dès qu'on l'écran rétrécit.
     */
    const styles = getComputedStyle(stage);
    const gutter = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const available = Math.max(stage.clientWidth - gutter, 80);

    // Hauteur max adaptée selon le viewport : le cadre reste entier visible.
    const isMobile = window.innerWidth < 768;
    const maxH = isMobile ? 280 : 520;
    const z = Math.min(available / specRef.current.width, maxH / specRef.current.height);
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
        // La sélection tombe (clic ailleurs, Échap) : l'édition est terminée.
        setEditingTextId(null);
        setGuides({ v: false, h: false });
      });
      /*
       * Fabric signale lui-même l'entrée et la sortie d'édition (double-clic,
       * clic ailleurs, Échap). On s'y abonne plutôt que de deviner : c'est ce
       * qui garde le bouton « Valider » aligné sur l'état réel du canvas.
       */
      canvas.on('text:editing:entered', (event) => {
        setEditingTextId((event.target as TaggedObject | undefined)?.layerId ?? null);
      });
      canvas.on('text:editing:exited', () => {
        setEditingTextId(null);
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
      const maxZ = descriptor.layers.reduce((max, l) => Math.max(max, l.z ?? 0), 0);
      const layer = makeImageLayer(src, descriptor.ratio, {
        w,
        h,
        x: Math.round((spec.width - w) / 2),
        y: Math.round((spec.height - h) / 2),
        z: maxZ + 10,
        label: file.name,
      });

      const next = { ...descriptor, layers: [...descriptor.layers, layer] };
      await buildObjects(next);
      applyLocks();
      selectOnCanvas(layer.id);
      fitToView();
      setSelectedId(layer.id);
      setTab('cadre');
      onChange(next);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ajoute un calque **au-dessus de tout le cadre**.
   *
   * `nextZ()` est la seule autorité du « prochain z » : il lit le sommet réel
   * du descripteur, là où l'ancien calcul `layers.length * 10 + 10` produisait
   * un `z` déjà occupé après une suppression. Un calque ajouté — texte, image
   * ou forme — passe donc devant, sans exception : c'est la règle « le dernier
   * ajouté est devant », et pour un texte c'est une exigence absolue.
   */
  async function addText() {
    if (layerLimitReached) {
      setError(`La formule Free limite à ${maxLayers} éléments par cadre.`);
      return;
    }
    const { makeTextLayer } = await import('@/lib/descriptor');
    const layer = makeTextLayer('Votre texte', descriptor.ratio, {
      size: Math.round(spec.width * 0.09),
      z: nextZ(descriptor.layers),
    });
    const next = { ...descriptor, layers: [...descriptor.layers, layer] };
    await buildObjects(next);
    applyLocks();
    selectOnCanvas(layer.id);
    fitToView();
    setSelectedId(layer.id);
    setTab('cadre');
    onChange(next);
    // Le texte s'ouvre directement à l'édition, sur le visuel : l'utilisateur
    // écrit sans double-clic préalable.
    focusTextForEditing(layer.id);
  }

  /**
   * Pose une forme géométrique au centre du cadre.
   *
   * Rien n'est téléversé : une forme est une poignée de nombres. Elle s'ajoute
   * donc instantanément, se rejoue à l'identique côté participant, et ne
   * consomme aucun octet de stockage.
   */
  async function addShape(kind: ShapeKind) {
    if (layerLimitReached) {
      setError(`La formule Free limite à ${maxLayers} éléments par cadre.`);
      return;
    }
    const { makeShapeLayer } = await import('@/lib/descriptor');
    const layer = makeShapeLayer(kind, descriptor.ratio, {
      z: nextZ(descriptor.layers),
    });
    const next = { ...descriptor, layers: [...descriptor.layers, layer] };
    await buildObjects(next);
    applyLocks();
    selectOnCanvas(layer.id);
    fitToView();
    setSelectedId(layer.id);
    setTab('cadre');
    onChange(next);
  }

  /* ---------------- Actions sur l'élément sélectionné ---------------- */
  const patchSelected = useCallback(
    async (patch: LayerPatch) => {
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

      if (patch.x !== undefined) active.set({ left: patch.x });
      if (patch.y !== undefined) active.set({ top: patch.y });
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
        if (patch.weight !== undefined)
          active.set({ fontWeight: patch.weight === 'bold' ? 'bold' : 'normal' });
        if (patch.style !== undefined)
          active.set({ fontStyle: patch.style === 'italic' ? 'italic' : 'normal' });
        if (patch.letterSpacing !== undefined) active.set({ charSpacing: patch.letterSpacing });
        if (patch.lineHeight !== undefined) active.set({ lineHeight: patch.lineHeight });
        // La courbure ne se pose pas par `set()` : il faut reconstruire le
        // chemin, puis remesurer la boîte.
        if (patch.curve !== undefined) {
          await applyCurve(active as unknown as import('fabric').IText, patch.curve);
          (active as TaggedObject).layerCurve = patch.curve;
        }
        // Fabric ne recompose pas la boîte de texte de lui-même : sans
        // `initDimensions()`, le texte garderait son ancienne largeur jusqu'au
        // prochain rebuild — et le panneau semblerait ne rien faire.
        (active as unknown as { initDimensions?: () => void }).initDimensions?.();
      }

      if ((active as TaggedObject).layerKind === 'shape') {
        const tagged = active as TaggedObject;
        const current = tagged.layerShape;

        /*
         * Changer de nature, c'est changer d'objet Fabric : un cercle n'est pas
         * un polygone. On reconstruit — mais en conservant tout ce que
         * l'utilisateur a réglé par ailleurs, position et taille comprises.
         */
        if (patch.kind !== undefined && current && patch.kind !== current.kind) {
          const next: ShapeLayer = {
            ...current,
            kind: patch.kind,
            x: Math.round(active.left ?? 0),
            y: Math.round(active.top ?? 0),
            /*
             * Géométrie nue, jamais `getScaledWidth()` : celui-ci ajoute le
             * contour, et la forme enflerait à chaque changement de nature.
             */
            w: Math.round((active.width ?? 0) * (active.scaleX ?? 1)),
            h: Math.round((active.height ?? 0) * (active.scaleY ?? 1)),
            rotation: Math.round(active.angle ?? 0),
            opacity: active.opacity ?? 1,
            // Un losange n'a pas de coins : l'arrondi ne le suit pas.
            radius: shapeSpec(patch.kind).hasRadius ? current.radius : 0,
          };

          const replacement = await createShapeObject(next, descriptorRef.current.ratio, {
            interactive: true,
          });
          const taggedNext = replacement as TaggedObject;
          taggedNext.layerId = next.id;
          taggedNext.layerKind = 'shape';
          taggedNext.layerShape = next;

          const at = canvas.getObjects().indexOf(active);
          /*
           * Le remplacement n'est PAS une modification. Sans ce verrou, le
           * retrait puis l'ajout émettraient chacun un descripteur amputé, et
           * l'autosave enregistrerait un cadre sans la forme.
           */
          building.current = true;
          canvas.remove(active);
          if (at >= 0) canvas.insertAt(at, replacement);
          else canvas.add(replacement);
          building.current = false;

          // Sans cela, le panneau perdrait le fil : Fabric a oublié l'objet
          // actif en même temps que l'ancien, et les réglages suivants
          // n'atteindraient plus rien.
          canvas.setActiveObject(replacement);
          applyLocks();
          canvas.requestRenderAll();
          emitFromCanvas();
          return;
        }

        const shapePatch: Partial<ShapeLayer> = {};
        if (patch.fill !== undefined) shapePatch.fill = patch.fill;
        if (patch.stroke !== undefined) shapePatch.stroke = patch.stroke;
        if (patch.strokeWidth !== undefined) shapePatch.strokeWidth = patch.strokeWidth;
        if (patch.radius !== undefined) shapePatch.radius = patch.radius;

        if (current && Object.keys(shapePatch).length > 0) {
          tagged.layerShape = { ...current, ...shapePatch };
          applyShapePaint(active, tagged.layerShape, descriptorRef.current.ratio);
        }
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

  /**
   * Remonte ou descend le calque sélectionné dans la pile.
   *
   * `front` / `back` avancent d'un **cran** : c'est le geste répété qui finit
   * par untenir le calque devant, et non un saut qui le téléporte d'un coup au
   * bout de la pile. `front-most` / `back-most` sont les deux extrêmes, pour
   * qui sait d'avance où il veut aller.
   */
  const moveSelected = useCallback(
    (direction: 'front' | 'back' | 'front-most' | 'back-most') => {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;

      switch (direction) {
        case 'front':
          canvas.bringObjectForward(active);
          break;
        case 'back':
          canvas.sendObjectBackwards(active);
          break;
        case 'front-most':
          canvas.bringObjectToFront(active);
          break;
        case 'back-most':
          canvas.sendObjectToBack(active);
          break;
      }

      canvas.requestRenderAll();
      emitFromCanvas();
    },
    [emitFromCanvas],
  );

  /**
   * Aligne le calque sélectionné dans la largeur du cadre.
   *
   * Comme l'alignement vertical, c'est un déplacement et non un réglage stocké :
   * le descripteur ne garde que la position, donc rien ne peut devenir
   * incohérent si l'utilisateur déplace ensuite l'élément à la main.
   */
  const alignHorizontal = useCallback(
    (where: 'left' | 'center' | 'right') => {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;
      const s = specRef.current;
      // Géométrie nue : `getScaledWidth()` ajouterait l'épaisseur du contour et
      // l'alignement serait faux d'un ou deux pixels.
      const w = (active.width ?? active.getScaledWidth()) * (active.scaleX ?? 1);
      const margin = Math.round(s.width * 0.06);
      const left =
        where === 'left'
          ? margin
          : where === 'right'
            ? Math.max(margin, Math.round(s.width - w - margin))
            : Math.round((s.width - w) / 2);
      active.set({ left });
      active.setCoords();
      canvas.requestRenderAll();
      emitFromCanvas({ coalesce: true });
    },
    [emitFromCanvas],
  );

  /**
   * Duplique le calque sélectionné, décalé.
   *
   * Le décalage n'est pas décoratif : un clone exactement superposé est
   * impossible à reprendre au pointeur, et l'utilisateur croirait que le bouton
   * n'a rien fait. Il est exprimé en fraction du cadre, donc proportionnel à
   * ce qu'on voit.
   */
  const duplicateSelected = useCallback(
    async (id?: string) => {
      const canvas = canvasRef.current;
      const targetId = id ?? selectedId;

      /*
       * Un clone ne se fait que sur une sélection réelle. Depuis la liste des
       * calques, l'objet n'est pas forcément actif : on l'active d'abord, sinon
       * le bouton ne ferait rien et l'utilisateur le prendrait pour un bug.
       */
      if (id && id !== selectedId) {
        const object = (canvas?.getObjects() as TaggedObject[] | undefined)?.find(
          (obj) => obj.layerId === id,
        );
        if (canvas && object) {
          canvas.setActiveObject(object);
          canvas.requestRenderAll();
        }
        setSelectedId(id);
      }

      const active = canvasRef.current?.getActiveObject();
      if (!canvas || !active || layerLimitReached) return;

      const source = descriptorRef.current.layers.find((l) => l.id === targetId);
      if (!source) return;

      /*
       * Dupliquer un texte ou une forme, c'est en AJOUTER un : la règle est
       * donc celle des boutons d'ajout (module Frame Pro). Sans cette garde, un
       * compte Gratuit qui a hérité d'un texte — reprise d'un cadre de la
       * galerie — pourrait en fabriquer d'autres en contournant le verrou.
       * L'image reste libre : c'est le cœur du cadre, pas un module.
       */
      if (source.type !== 'image' && !hasFeature(plan, 'frame_pro')) return;

      const s = specRef.current;
      const offset = Math.round(Math.min(s.width, s.height) * 0.02);

      const copy: Layer = {
        ...structuredClone(source),
        id: makeLayerId(),
        x: source.x + offset,
        y: source.y + offset,
        // Un clone ne naît ni masqué ni verrouillé : on duplique ce qu'on voit,
        // pas un réglage qu'on a fait exprès de cacher.
        visible: undefined,
        locked: undefined,
        /*
         * Le clone passe **devant** : c'est la seule place que le descripteur
         * peut lui garantir.
         *
         * L'ancien `source.z + 1` voulait dire « juste au-dessus de l'original »,
         * mais ce `z` était de toute façon écrasé au premier `emitFromCanvas`,
         * qui le recalcule depuis l'**index** dans le tableau Fabric. Or le clone
         * est ajouté en fin de tableau : il finissait donc au sommet, pas au-dessus
         * de sa source — le clone d'un calque du fond passait devant le texte.
         * Pire, `source.z + 1` pouvait égaler un `z` voisin (10, 11, 20…) et
         * produire un `z` dupliqué, exactement ce que `nextZ` a été écrit pour
         * éviter.
         *
         * `nextZ` est la seule autorité du « prochain z » : il lit le sommet réel.
         */
        z: nextZ(descriptorRef.current.layers),
      };

      const next: Descriptor = {
        ...descriptorRef.current,
        layers: [...descriptorRef.current.layers, copy],
      };

      await buildObjects(next);
      applyLocks();

      // Le clone devient le calque sélectionné : c'est lui qu'on vient de créer,
      // et c'est sur lui qu'on enchaîne les réglages.
      selectOnCanvas(copy.id);
      setSelectedId(copy.id);
      onChange(next);
    },
    [applyLocks, buildObjects, layerLimitReached, onChange, plan, selectOnCanvas, selectedId],
  );

  /**
   * Masque ou réaffiche un calque.
   *
   * Le changement passe par le descripteur — donc par une reconstruction — et
   * non par un simple `obj.visible`. C'est plus lourd, mais c'est la seule voie
   * qui survive : `emitFromCanvas` relit la visibilité sur le descripteur, donc
   * un simple `set({ visible: false })` serait effacé au prochain déplacement
   * d'un autre calque.
   *
   * La sélection est rendue puis rétablie, pour que l'utilisateur ne perde pas
   * le calque qu'il vient de masquer.
   */
  const toggleLayerVisible = useCallback(
    async (id: string) => {
      const layer = descriptorRef.current.layers.find((l) => l.id === id);
      if (!layer) return;

      const next: Descriptor = {
        ...descriptorRef.current,
        layers: descriptorRef.current.layers.map((l) =>
          l.id === id ? { ...l, visible: l.visible === false } : l,
        ),
      };

      await buildObjects(next);
      applyLocks();
      // Le calque masqué ne peut pas être actif — on ne sélectionne pas ce
      // qu'on ne voit pas. Le panneau reste néanmoins sur lui, pour que le
      // bouton « Afficher » soit à portée.
      selectOnCanvas(id);
      setSelectedId(id);
      onChange(next);
    },
    [applyLocks, buildObjects, onChange, selectOnCanvas],
  );

  /**
   * Verrouille ou déverrouille un calque.
   *
   * On ne touche pas au descripteur seul : l'objet Fabric doit perdre ses
   * poignées dans la foulée, sinon le calque resterait déplaçable à la souris
   * alors que l'interface annonce le contraire.
   */
  const toggleLayerLocked = useCallback(
    (id: string) => {
      const canvas = canvasRef.current;
      const layer = descriptorRef.current.layers.find((l) => l.id === id);
      if (!layer) return;
      const locked = layer.locked !== true;

      onChange({
        ...descriptorRef.current,
        layers: descriptorRef.current.layers.map((l) => (l.id === id ? { ...l, locked } : l)),
      });

      const object = (canvas?.getObjects() as TaggedObject[]).find(
        (obj) => obj.layerId === id,
      );
      if (object) {
        (object as TaggedObject).layerLocked = locked;
        applyLocks();
      }
    },
    [applyLocks, onChange],
  );

  /**
   * Déplace un calque d'un cran dans la pile, par identifiant.
   *
   * L'ordre de la pile est l'index dans la scène Fabric, et le `z` du
   * descripteur est réécrit à chaque émission depuis cet index. On travaille
   * donc directement sur les objets, sans reconstruire la scène : une
   * reconstruction ferait perdre la sélection et rejouerait le rendu.
   */
  const shiftLayer = useCallback(
    (id: string, delta: 1 | -1) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const objects = canvas.getObjects() as TaggedObject[];
      const at = objects.findIndex((obj) => obj.layerId === id);
      if (at < 0) return;

      const target = at + delta;
      if (target < 0 || target >= objects.length) return;

      const object = objects[at];
      if (delta > 0) canvas.bringObjectForward(object);
      else canvas.sendObjectBackwards(object);
      canvas.requestRenderAll();
      emitFromCanvas();
    },
    [emitFromCanvas],
  );

  /** Supprime un calque par identifiant, sans passer par la sélection. */
  const deleteLayer = useCallback(
    (id: string) => {
      const canvas = canvasRef.current;
      const object = (canvas?.getObjects() as TaggedObject[] | undefined)?.find(
        (obj) => obj.layerId === id,
      );
      if (canvas && object) {
        canvas.remove(object);
        canvas.requestRenderAll();
      }
      setSelectedId((current) => (current === id ? null : current));
      emitFromCanvas();
    },
    [emitFromCanvas],
  );

  /**
   * Remplace le décor du cadre par celui d'un modèle.
   *
   * Le format et le type de campagne ne bougent pas : `applyTemplate` met le
   * modèle à l'échelle du format courant. Ce que l'utilisateur perd — le décor
   * précédent — est annoncé par la modale avant l'application, pas après.
   */
  /**
   * Les modèles de cadres sont un module premium (`templates_premium`).
   *
   * La règle est lue depuis `lib/plans.ts`, jamais recopiée : le bouton du
   * panneau porte déjà le verrou, et cette garde couvre les autres chemins
   * (raccourci, appel direct) — on ne se repose pas sur l'état d'un bouton
   * pour protéger un droit.
   */
  const templatesUnlocked = hasFeature(plan, 'templates_premium');

  /**
   * Formes et textes : module Frame Pro (`frame_pro`).
   *
   * Les boutons d'ajout du panneau portent déjà le verrou ; cette lecture sert
   * aux chemins qui **ajoutent** sans passer par un bouton d'ajout — la
   * duplication d'un calque existant. Même discipline que les modèles : on ne
   * se repose pas sur l'état d'un bouton pour protéger un droit.
   */
  const compositionUnlocked = hasFeature(plan, 'frame_pro');

  const openTemplates = useCallback(() => {
    if (!templatesUnlocked) {
      const required =
        PREMIUM_MODULES.find((m) => m.feature === 'templates_premium')?.availableFrom ?? 'creator';
      setError(
        `Les modèles de cadres sont réservés à la formule ${PLANS[required].name}. ` +
          'Votre travail actuel est conservé.',
      );
      return;
    }
    setError(null);
    setTemplatesOpen(true);
  }, [templatesUnlocked]);

  const useTemplate = useCallback(
    async (template: FrameTemplate, preserveContent: boolean) => {
      if (!templatesUnlocked) {
        setError('Les modèles de cadres sont réservés aux formules payantes.');
        return;
      }
      /*
       * `kind` est passé au modèle, et ce n'est pas un détail : c'est lui qui
       * autorise un modèle détouré à poser `subject: 'cutout'`. Sur un cadre
       * photo, le drapeau serait posé sans que le parcours participant le
       * traite — et il changerait quand même le dimensionnement de la photo.
       */
      const next = applyTemplate(descriptorRef.current, template, preserveContent, kind);
      await buildObjects(next);
      applyLocks();
      setSelectedId(null);
      onChange(next);
    },
    [applyLocks, buildObjects, kind, onChange, templatesUnlocked],
  );

  const selectedLayer = descriptor.layers.find((l) => l.id === selectedId) ?? null;
  const zoneLayer = descriptor.layers.find((l) => l.id === descriptor.photo_anchor) ?? null;

  /**
   * Alignement vertical dans le cadre.
   *
   * Ce n'est pas un réglage stocké mais un déplacement : le descripteur ne garde
   * que la position. Rien ne peut donc devenir incohérent si l'utilisateur
   * déplace ensuite l'élément à la main.
   */
  const alignVertical = useCallback(
    (where: VerticalAlign) => {
      const canvas = canvasRef.current;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;
      const s = specRef.current;
      const h = active.getScaledHeight();
      const margin = Math.round(s.height * 0.06);
      const top =
        where === 'top'
          ? margin
          : where === 'bottom'
            ? Math.max(margin, Math.round(s.height - h - margin))
            : Math.round((s.height - h) / 2);
      active.set({ top });
      active.setCoords();
      canvas.requestRenderAll();
      emitFromCanvas({ coalesce: true });
    },
    [emitFromCanvas],
  );

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
  /*
   * Le panneau affiché dépend d'abord de l'onglet, ensuite de la sélection.
   *
   * « Calques » reste une liste même quand un calque est sélectionné : c'est
   * l'onglet qui donne le contexte, pas l'état de la scène. Sans cela, on ne
   * pourrait pas revenir à la liste sans désélectionner, et « masquer »
   * depuis la liste reviendrait à faire disparaître l'inspecteur sous elle.
   */
  const panel =
    tab === 'animation' ? (
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
    ) : tab === 'calques' ? (
      <LayersPanel
        layers={descriptor.layers}
        selectedId={selectedId}
        photoAnchorId={descriptor.photo_anchor}
        maxLayers={maxLayers}
        onSelect={(id) => {
          setSelectedId(id);
          setTab('cadre');
          if (isCompactViewport()) setSheet(true);
          // La sélection doit exister sur le canvas, sinon le panneau affiche
          // des réglages pour un calque que l'utilisateur ne voit pas.
          selectOnCanvas(id);
        }}
        onToggleVisible={(id) => void toggleLayerVisible(id)}
        onToggleLock={toggleLayerLocked}
        onMoveUp={(id) => shiftLayer(id, 1)}
        onMoveDown={(id) => shiftLayer(id, -1)}
        onDuplicate={(id) => void duplicateSelected(id)}
        canDuplicate={(id) => {
          const layer = descriptor.layers.find((l) => l.id === id);
          return layer?.type === 'image' || compositionUnlocked;
        }}
        onDelete={deleteLayer}
        onSetPhotoZone={setPhotoZone}
      />
    ) : selectedLayer ? (
      <LayerPanel
        layer={selectedLayer}
        ratio={descriptor.ratio}
        isZone={descriptor.photo_anchor === selectedLayer.id}
        otherZone={zoneLayer && zoneLayer.id !== selectedLayer.id ? zoneLayer : null}
        onPatch={patchSelected}
        onDelete={deleteSelected}
        duplicateLocked={selectedLayer.type !== 'image' && !compositionUnlocked}
        onDuplicate={() => void duplicateSelected()}
        onOrder={moveSelected}
        onAlignHorizontal={alignHorizontal}
        onAlignVertical={alignVertical}
        onToggleZone={() =>
          setPhotoZone(descriptor.photo_anchor === selectedLayer.id ? null : selectedLayer.id)
        }
        onToggleLock={() => toggleLayerLocked(selectedLayer.id)}
        onToggleVisible={() => void toggleLayerVisible(selectedLayer.id)}
      />
    ) : (
      <FramePanel
        descriptor={descriptor}
        kind={kind}
        maxLayers={maxLayers}
        plan={plan}
        onAddImage={() => fileInputRef.current?.click()}
        onAddText={() => void addText()}
        onAddShape={(shape) => void addShape(shape)}
        onChangeRatio={changeRatio}
        onOpenTemplates={openTemplates}
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
        icon={<LayersIcon className="size-[18px]" strokeWidth={1.75} />}
        label="Calques"
        active={tab === 'calques'}
        onClick={() => {
          setTab('calques');
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
            aria-label="Outils de l'éditeur"
            className="hidden shrink-0 flex-col gap-1 md:flex"
          >
            {toolbar}
            <span className="my-1 h-px bg-gray-200" />
            {historyButtons}
          </nav>
        )}

        {/* ---------------- Scène ---------------- */}
        <div className="min-w-0 flex-1">
          {/*
            Zone de travail style Photopea :
            - fond gris neutre qui donne de la profondeur et isole le canvas
            - canvas centré avec ombre légère et contours nets
            - damier de transparence posé directement sous le canvas
            - hauteur calculée dynamiquement selon le ratio du format
          */}
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
            className="relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-lg p-4 transition-colors md:min-h-[360px] md:p-8"
            style={{
              backgroundColor: '#787878',
              /* Anneau bleu subtil quand on survole en mode drag */
              outline: dragging ? '2px solid #a78bfa' : 'none',
              outlineOffset: '-2px',
            }}
          >
            {/* Canvas + damier de transparence en surimpression directe */}
            <div
              className="relative"
              style={{
                lineHeight: 0,
                /* Ombre portée nette — délimite le format sans border */
                boxShadow: '0 4px 24px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)',
              }}
            >
              {/*
                Damier de transparence posé DERRIÈRE le canvas.
                Identique à Photopea : gris clair / gris légèrement plus foncé.
                Il est strictement limité aux dimensions du canvas grâce au
                positionnement absolu inset-0 sur le parent `relative`.
              */}
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

              <canvas ref={canvasElRef} role="img" aria-label="Cadre en cours d'édition" />

              {/*
                Contour fin du format — en surimpression, jamais sur le canvas.
                Couleur blanche semi-transparente pour rester visible sur tous fonds.
              */}
              {!preview && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.6)' }}
                />
              )}

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

            {/*
              Barre « Valider » : elle n'existe que pendant l'édition d'un texte.
              Le geste est explicite plutôt qu'implicite (cliquer ailleurs) ;
              c'est aussi ce qui termine l'édition au doigt, sans clavier.
            */}
            {editingTextId && !preview && (
              <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-pill bg-ink/95 px-2 py-1 shadow-lg backdrop-blur">
                <span className="pl-2 text-[12px] font-medium text-white/80">
                  Modification du texte
                </span>
                <Button size="sm" onClick={commitTextEditing}>
                  Valider
                </Button>
              </div>
            )}

            {/* Format courant, en bas à droite : langage naturel, jamais une
                résolution technique (§12 du design system). */}
            {!preview && (
              <span className="pointer-events-none absolute bottom-2 right-3 select-none text-[11px] font-medium text-white/70">
                {spec.label}
              </span>
            )}

            {dragging && !preview && (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: 'rgba(167,139,250,0.15)' }}
              >
                <span className="rounded-pill bg-ink px-5 py-2.5 text-[13px] font-medium text-white shadow-lg">
                  Déposez votre image
                </span>
              </div>
            )}

            {busy && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(120,120,120,0.5)' }}>
                <Loader2 className="size-5 animate-spin text-white" aria-hidden />
              </div>
            )}
          </div>

          {!preview && (
            <p className="mt-3 text-center text-[12px] leading-relaxed text-gray-500">
              Glissez une image sur la scène, déplacez-la, redimensionnez-la. Le centre s�aligne
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
        title={TAB_TITLES[tab]}
      >
        {panel}
      </Drawer>

      {/*
        La modale des modèles est montée hors du panneau : elle doit survivre
        au changement d'onglet, et n'a rien à voir avec la disposition en trois
        colonnes. Elle ne rend rien quand elle est fermée.
      */}
      <TemplatesModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onSelectTemplate={(template, preserve) => void useTemplate(template, preserve)}
        currentKind={kind}
        currentRatio={descriptor.ratio}
      />
    </div>
  );
}
