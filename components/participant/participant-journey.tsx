'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  ImagePlus,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Type,
  Undo2,
  Video,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Pipette,
  Eye,
  MoreHorizontal,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/ui/logo';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InlineError, Spinner } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { ParticipantStage } from '@/components/participant/participant-stage';
import { SharePanel } from '@/components/participant/share-panel';
import { WatermarkUpsell } from '@/components/participant/watermark-upsell';
import {
  WatermarkPassButton,
  WatermarkPassStatus,
} from '@/components/participant/watermark-pass-button';
import { useWatermarkPass } from '@/components/participant/use-watermark-pass';
import { backend } from '@/lib/backend';
import { distributionService } from '@/lib/distribution-service';
import { PrivateExportCoordinator, PrivateExportUnavailable, technicalHash, type PreparedPrivateExport } from '@/lib/distribution-export';
import { frameZone, isCutout, photoZone } from '@/lib/descriptor';
import {
  ABANDON_AFTER_MS,
  chooseModel,
  cutoutErrorMessage,
  cutoutFailureReason,
  cutoutOutcome,
  cutoutPhoto,
  detectWebGpu,
  downloadNeedsConsent,
  firstLoadTransferBytes,
  formatBytes,
  isMeteredConnection,
  shouldOfferServerFallback,
  type ConnectionLike,
  type CutoutModel,
  type CutoutOutcome,
  type GpuLike,
} from '@/lib/cutout';
import { emit } from '@/lib/telemetry';
import { ratioSpec } from '@/lib/ratios';
import type { PlanId } from '@/lib/plans';
import {
  dataUrlToBlob,
  downloadBlob,
  exportFilename,
  exportPng,
  exportVideo,
  exportVideoClip,
} from '@/lib/video-export';
import {
  CLIP_STEP_MS,
  clipWindow,
  fitsWithinLimit,
  formatClipDuration,
  maxClipStart,
  pseudoPhoto,
  readVideoFile,
  type ParticipantVideo,
} from '@/lib/video-clip';
import {
  DEFAULT_PARTICIPANT_STATE,
  MAX_ZOOM,
  MIN_ZOOM,
  TEXT_COLORS,
  TEXT_MAX_LENGTH,
  composeDescriptor,
  defaultParticipantText,
  initialPlacement,
  isSameParticipantState,
  movableAxes,
  photoFit,
  readPhotoFile,
  zoomAroundCenter,
  type ParticipantPhoto,
  type ParticipantState,
  type ParticipantText,
  type PhotoPlacement,
} from '@/lib/participant';
import { useHistory } from '@/components/editor/use-history';
import { PHOTO_FILTER_PRESETS, type PhotoFilter } from '@/lib/photo-filters';
import { blockedMessage, privateLinkBlockedMessage, remaining } from '@/lib/quota';
import { exportPlanFor, shouldWatermark } from '@/lib/watermark-policy';
import { FONTS } from '@/lib/fonts';
import type { CampaignQuota, GalleryItem } from '@/lib/types';

/**
 * Ce que le détourage a donné — et l'original, toujours gardé.
 *
 * `original` est conservé dans **les trois** états, pas seulement en cas
 * d'échec : un détourage réussi doit pouvoir être rejoué (le participant veut
 * essayer un autre cadrage de la même photo), et une photo déjà détourée ne
 * peut pas servir d'entrée à un second détourage — le masque s'appliquerait à
 * un sujet qui n'a plus de fond, et le résultat serait un trou.
 */
type CutoutAttempt =
  | { status: 'running'; original: ParticipantPhoto; message: string; ratio?: number }
  | { status: 'done'; original: ParticipantPhoto; outcome: CutoutOutcome; message: string }
  | { status: 'failed'; original: ParticipantPhoto; message: string };

/**
 * Ce qu'on dit quand le détourage dépasse le seuil d'attente.
 *
 * La formulation est contrainte par une décision : le recours au serveur est
 * prévu par l'arbitrage du 2026-10-10, mais **le chemin serveur n'est pas
 * écrit**. On ne peut donc pas le proposer. Ce message dit la seule chose qui
 * soit vraie et utile — que ça continue, et que le détourage ne fait pas
 * sortir la photo de l'appareil.
 */
const CUTOUT_SLOW_MESSAGE =
  'Le détourage prend plus de temps que prévu. Votre photo est traitée sur votre appareil.';

const TWIBBON_COLOR_PAGES: readonly string[][] = [
  ['#000000', '#374151', '#64748b', '#94a3b8', '#ffffff', '#ef4444'],
  ['#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6'],
  ['#ec4899', '#78350f', '#14532d', '#1e3a8a', '#581c87', '#881337'],
];

/**
 * Parcours participant — l'écran que voit la communauté du créateur.
 *
 * Il doit tenir en trois gestes : **je choisis ma photo, je la place, je
 * télécharge.** Ce qui s'ajoute autour — filtre, texte — reste facultatif et ne
 * rallonge jamais le chemin de quelqu'un qui veut juste son visuel.
 *
 * Aucun compte, aucune application, aucun formulaire. La photo est lue dans le
 * navigateur et n'est jamais envoyée : le participant n'a rien à accepter, et il
 * n'y a rien à modérer côté plateforme. Le filtre et le texte suivent la même
 * règle — ils vivent dans le descripteur composé, en mémoire, et ne sont jamais
 * transmis.
 *
 * Ce composant est **le seul** parcours participant du produit. Les deux routes
 * qui le servent — `/c/[slug]` (public) et `/d/[token]` (lien privé) — ne
 * diffèrent que par la façon dont la campagne est chargée et par le partage
 * social, autorisé uniquement sur le lien public. Les dupliquer ferait diverger
 * deux écrans que le participant ne distingue pas.
 */
export function ParticipantJourney({
  campaign,
  loading,
  sharing = true,
  distributionToken = null,
  clientLogoUrl = null,
  privateAccessReady = false,
}: {
  privateAccessReady?: boolean;
  campaign: GalleryItem | null;
  loading: boolean;
  /**
   * Le partage social n'est proposé que sur le lien public.
   *
   * Ce drapeau ne décrit pas qu'une affordance : il **identifie l'origine du
   * parcours**, donc la règle commerciale du badge (voir `showWatermark`).
   * `/c/:slug` partage → diffusion publique → badge toujours posé.
   * `/d/:token` ne partage pas → diffusion choisie par le créateur → sa formule.
   */
  sharing?: boolean;
  /**
   * Jeton du lien privé, quand le parcours est servi par `/d/[token]`.
   *
   * Sa présence décide **quel quota est consommé** : le lien privé a son propre
   * plafond, distinct de celui de la campagne. Sans ce jeton, le parcours privé
   * consommait le quota global et le plafond vendu au client n'était jamais
   * opposable.
   *
   * Il n'est jamais affiché, jamais copié, jamais partagé : c'est le secret
   * d'accès.
   */
  distributionToken?: string | null;
  /** Logo du client, affiché uniquement sur `/d/[token]`. */
  clientLogoUrl?: string | null;
}) {
  /*
   * Un seul état, un seul historique.
   *
   * Le participant réglait trois choses séparément (photo, placement, style) ;
   * elles tiennent maintenant dans une valeur unique, ce qui permet d'annuler
   * n'importe quel geste — un filtre, une frappe, un glissement — avec le même
   * bouton, et sans que l'écran ait à savoir ce qui a changé.
   *
   * `coalesceMs` est plus long que dans l'éditeur créateur (700 ms) : déplacer
   * une photo au doigt produit beaucoup plus d'événements qu'un glissement à la
   * souris, et annuler doit rendre le geste entier, pas la dernière image du
   * geste.
   */
  const history = useHistory<ParticipantState>(DEFAULT_PARTICIPANT_STATE, {
    limit: 40,
    coalesceMs: 900,
    /*
     * Comparaison structurelle, et non d'identité : chaque geste reconstruit un
     * objet neuf, même à valeur égale. Sans cela l'historique empilerait des
     * entrées identiques et « Annuler » semblerait ne rien faire.
     */
    equals: isSameParticipantState,
  });
  const { photo, placement, style } = history.value;

  /** Raccourci : toute modification du parcours passe par ici. */
  const update = history.set;

  /**
   * L'état courant, lu par référence depuis les rappels du canvas.
   *
   * `update()` accepte déjà une fonction de l'état précédent — c'est ce qu'il
   * faut pour le texte. Pour le placement, la scène fournit une valeur absolue
   * et non un delta ; sans cette référence, le rappel devrait dépendre de
   * `placement`, donc être recréé à chaque rendu, donc reconstruire la scène
   * Fabric pendant que le participant fait glisser sa photo.
   */
  const historyStateRef = useRef(history.value);
  historyStateRef.current = history.value;

  const setPhoto = useCallback(
    (next: ParticipantState['photo'], nextPlacement: PhotoPlacement | null, reset: boolean) => {
      // Un changement de photo repart d'un historique propre : les placements
      // d'une photo n'ont aucun sens pour la suivante, et empiler les deux
      // ferait « annuler » vers un cadrage qui n'a jamais existé.
      if (reset) {
        history.reset({ photo: next, placement: nextPlacement, style: DEFAULT_PARTICIPANT_STATE.style });
        return;
      }
      update((current) => ({ ...current, photo: next, placement: nextPlacement }));
    },
    // `history` est stable (mémorisé par le hook) : le lire dans la portée ne
    // doit pas recréer ce rappel à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update],
  );

  const setPlacement = useCallback(
    (next: PhotoPlacement | ((prev: PhotoPlacement | null) => PhotoPlacement | null)) => {
      update((current) => ({
        ...current,
        placement: typeof next === 'function' ? next(current.placement) : next,
      }));
    },
    [update],
  );

  const setStyle = useCallback(
    (
      next:
        | ParticipantState['style']
        | ((prev: ParticipantState['style']) => ParticipantState['style']),
    ) => {
      update((current) => ({
        ...current,
        style: typeof next === 'function' ? next(current.style) : next,
      }));
    },
    [update],
  );

  const setText = useCallback(
    (next: ParticipantText | null) => {
      setStyle((current) => ({ ...current, text: next }));
    },
    [setStyle],
  );

  /**
   * Déplacement sur le canvas : une entrée par **geste**, pas par image.
   *
   * Le canvas émet un événement à chaque pixel parcouru. Sans regroupement,
   * annuler après un glissement demanderait des dizaines d'appuis pour revenir
   * au point de départ. C'est le rôle de `coalesce` de l'historique.
   */
  const setPlacementFromCanvas = useCallback(
    (next: PhotoPlacement) => {
      update({ ...historyStateRef.current, placement: next }, { coalesce: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update],
  );

  const setTextFromCanvas = useCallback(
    (next: ParticipantText) => {
      update(
        (current) => ({ ...current, style: { ...current.style, text: next } }),
        { coalesce: true },
      );
    },
    [update],
  );

  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [colorPage, setColorPage] = useState(0);
  const [activePanel, setActivePanel] = useState<'adjust' | 'text' | null>(null);
  const [textFocusKey, setTextFocusKey] = useState(0);

  const [exporting, setExporting] = useState<'png' | 'video' | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /* ---------------- Détourage (campagnes `subject: 'cutout'`) ---------------- */
  const [cutoutAttempt, setCutoutAttempt] = useState<CutoutAttempt | null>(null);
  /**
   * Le moteur qui sera employé, et s'il faut l'accord du participant.
   *
   * Calculé **avant** tout téléchargement, parce que la question de l'accord se
   * pose avant, pas pendant. `null` tant qu'il n'est pas connu : on ne demande
   * jamais rien sur une information qu'on n'a pas encore.
   */
  const [cutoutPlan, setCutoutPlan] = useState<{
    model: CutoutModel;
    needsConsent: boolean;
  } | null>(null);
  const [consentGranted, setConsentGranted] = useState(false);
  /** L'accord est demandé : la photo est déjà affichée, le détourage attend. */
  const [askingConsent, setAskingConsent] = useState(false);
  /**
   * Quota de la campagne, lu dès le chargement. `null` tant qu'il n'est pas
   * connu — on ne suppose jamais qu'il est ouvert, sinon un participant verrait
   * le bouton de téléchargement avant de savoir qu'il est bloqué.
   */
  const [quota, setQuota] = useState<CampaignQuota | null>(null);
  const [privateClosed, setPrivateClosed] = useState(false);
  const [confirmedFile, setConfirmedFile] = useState<PreparedPrivateExport | null>(null);
  const exportCoordinator = useRef<PrivateExportCoordinator | null>(null);
  const exportBusy = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /*
   * Le clip vidéo du participant — présent uniquement sur une campagne vidéo.
   *
   * Il ne remplace pas la photo dans l'état : le parcours n'a qu'une seule
   * notion de « média du participant », et le clip fournit à la géométrie une
   * photo de mêmes dimensions (`pseudoPhoto`). Le placement, le zoom, les bornes
   * et la découpe de zone restent donc écrits une seule fois, et une campagne
   * vidéo se place exactement comme une campagne photo.
   */
  const [clip, setClip] = useState<ParticipantVideo | null>(null);
  const [clipStartMs, setClipStartMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  /** Conteneur hors écran de l'élément média : il doit rester dans le document. */
  const videoHolderRef = useRef<HTMLDivElement>(null);

  const notify = useToast();

  /**
   * La campagne attend-elle une vidéo ?
   *
   * C'est le `kind` de la campagne — décidé par le créateur à la création, et
   * lisible avant le cadre — qui tranche, jamais l'extension d'un fichier ni la
   * présence d'une animation. Un cadre animé reste un cadre **photo** : il
   * s'anime autour d'une image. Ici, c'est le média du participant qui est une
   * vidéo.
   */
  const isVideoCampaign = campaign?.kind === 'video_frame';

  /*
   * Le pass « Sans filigrane » est propre à ce navigateur (cookie `cn_bid`). On
   * le lit une fois ici, et une seule source alimente deux décisions : ce que
   * l'aperçu montre, et par quel chemin part le PNG.
   */
  const pass = useWatermarkPass();

  /* ---------------- Raccourcis clavier ---------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;

      /*
       * On n'intercepte pas la frappe dans un champ : il n'y a qu'un `<Input>`
       * (le texte du participant), et Ctrl+Z y appartient au navigateur — sa
       * pile interne et la nôtre sont deux choses différentes, et les mélanger
       * ferait perdre du texte sans prévenir.
       */
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      event.preventDefault();
      if (event.shiftKey) history.redo();
      else history.undo();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history]);

  /* ---------------- Quota ---------------- */
  useEffect(() => {
    if (!campaign || distributionToken || !sharing) return;
    let alive = true;
    setQuota(null);
    void backend.getCampaignQuota(campaign.id).then((found) => {
      if (alive) setQuota(found);
    }).catch(() => { if (alive) setError('Impossible de vérifier le quota de la campagne.'); });
    return () => {
      alive = false;
    };
  }, [campaign, distributionToken, sharing]);

  const frame = campaign?.frame?.descriptor_json ?? null;
  const ratio = frame?.ratio ?? campaign?.ratio ?? '1:1';
  const spec = useMemo(() => ratioSpec(ratio), [ratio]);

  /**
   * Tout le positionnement se fait dans la zone photo, pas dans le cadre entier :
   * le cadre en mode Cadre, la fenêtre du calque désigné en mode Fond. Le
   * participant n'a pas à connaître la différence — la zone est ce qu'il voit.
   */
  const zone = useMemo(() => (frame ? photoZone(frame) : frameZone(ratio)), [frame, ratio]);

  /**
   * L'ajustement du média : « couvrir » partout, « contenir » en détourage.
   *
   * Dérivé du cadre, jamais du type de campagne : c'est `subject` qui tranche,
   * et un même `background_frame` peut décrire les deux. Toutes les fonctions de
   * géométrie le reçoivent, sans quoi le placement affiché et le placement
   * exporté ne porteraient plus les mêmes nombres.
   */
  const fit = frame ? photoFit(frame) : 'cover';

  /**
   * La campagne demande-t-elle un détourage ?
   *
   * Deux conditions, et les deux sont nécessaires : le **type** de campagne
   * (`background_frame`) et le **drapeau** du descripteur (`subject: 'cutout'`).
   * Un même `background_frame` peut décrire les deux modes — c'est `subject` qui
   * tranche, et lui seul. Le type exclut au passage les campagnes vidéo : on ne
   * détoure pas une vidéo.
   */
  const isCutoutCampaign =
    campaign?.kind === 'background_frame' && frame !== null && isCutout(frame);

  /*
   * Quel moteur, et faut-il l'accord ? Tranché une fois, avant toute photo.
   *
   * `chooseModel()` est la **même** fonction que celle qu'emploiera
   * `cutoutPhoto()` : le parcours ne redécide pas la stratégie à deux étages, il
   * la lit. La recalculer autrement ferait diverger la taille annoncée au
   * participant de celle qui se télécharge réellement.
   */
  useEffect(() => {
    if (!isCutoutCampaign) return;
    let alive = true;
    void (async () => {
      const nav = (globalThis as { navigator?: { gpu?: GpuLike; connection?: ConnectionLike } })
        .navigator;
      const webgpu = await detectWebGpu(nav?.gpu);
      const model = chooseModel(webgpu);
      if (!alive) return;
      setCutoutPlan({
        model,
        needsConsent: downloadNeedsConsent(model, isMeteredConnection(nav?.connection)),
      });
    })();
    return () => {
      alive = false;
    };
  }, [isCutoutCampaign]);

  /**
   * L'ouverture du parcours, comptée **une fois**.
   *
   * Une fois, et pas à chaque rendu : `campaign` et `frame` changent d'identité
   * quand le quota se relit ou que le pass se rafraîchit, et un compteur
   * d'ouvertures qui suit les rendus ne mesure plus rien. La garde est un
   * `ref`, pas une dépendance — c'est la seule façon d'exprimer « une fois »
   * avec un effet.
   */
  const ouvertureComptee = useRef(false);
  useEffect(() => {
    if (ouvertureComptee.current || !campaign || !frame) return;
    ouvertureComptee.current = true;
    emit('journey_open', { kind: campaign.kind });
  }, [campaign, frame]);

  /**
   * Le détourage, avec son état de progression.
   *
   * Renvoie la photo à **afficher** : celle du détourage s'il a abouti, l'original
   * sinon. Un échec ne laisse jamais le parcours sans image — le participant a
   * fourni une photo, il doit en sortir quelque chose.
   */
  const applyCutout = useCallback(async (original: ParticipantPhoto): Promise<ParticipantPhoto> => {
    setCutoutAttempt({ status: 'running', original, message: 'Préparation de votre photo…' });
    const startedAt = Date.now();
    /*
     * Le seuil vient de l'arbitrage du 2026-10-10, et la décision passe par
     * `shouldOfferServerFallback()` plutôt que par une comparaison recopiée :
     * c'est cette fonction qui fait autorité sur le seuil.
     *
     * Elle décide ici d'un **message**, pas d'une bascule : le recours au serveur
     * est prévu par l'arbitrage mais le chemin serveur n'est pas écrit, donc on
     * ne le propose pas. Promettre un recours inexistant serait pire que de se
     * taire.
     */
    const lent = setTimeout(() => {
      setCutoutAttempt((attempt) =>
        attempt && attempt.status === 'running' && shouldOfferServerFallback(Date.now() - startedAt)
          ? { ...attempt, message: CUTOUT_SLOW_MESSAGE }
          : attempt,
      );
    }, ABANDON_AFTER_MS);

    try {
      const result = await cutoutPhoto(original, {
        onProgress: (p) =>
          setCutoutAttempt((attempt) =>
            attempt && attempt.status === 'running'
              ? { ...attempt, message: p.message, ratio: p.ratio }
              : attempt,
          ),
      });

      const outcome = cutoutOutcome(result.quality);
      if (outcome === 'unusable') {
        /*
         * Un masque qui a tout retiré n'est pas un résultat : c'est une image
         * blanche. On le traite comme un échec, et le message vient de
         * `judgeCutout()` — qui sait *pourquoi*, contrairement à nous.
         */
        /*
         * Pas de `reason` ici, et c'est volontaire : le verdict dit déjà
         * exactement ce qui s'est passé (« vide »). Inventer une raison
         * supplémentaire serait une seconde description de la même chose, donc
         * une seconde chose à tenir à jour.
         */
        emit('cutout_failed', {
          runtime: cutoutPlan?.model.runtime,
          verdict: result.quality.verdict,
          outcome,
          ms: Date.now() - startedAt,
        });
        setCutoutAttempt({ status: 'failed', original, message: result.quality.message });
        return original;
      }

      emit('cutout_ok', {
        runtime: cutoutPlan?.model.runtime,
        verdict: result.quality.verdict,
        outcome,
        ms: Date.now() - startedAt,
      });

      setCutoutAttempt({ status: 'done', original, outcome, message: result.quality.message });
      /*
       * Le détourage ne réduit pas la photo — le masque est appliqué à la pleine
       * résolution. Les dimensions sont donc celles de l'original, et le
       * placement du participant reste valable tel quel.
       */
      return { src: result.src, naturalWidth: result.width, naturalHeight: result.height };
    } catch (e) {
      /*
       * `cutoutFailureReason()` et non `cutoutErrorMessage()` : la mesure reçoit
       * une valeur **fermée** (« network », « gpu »…), jamais le message. Un
       * message d'erreur est du texte libre, et c'est précisément ce qu'on ne
       * transmet pas.
       */
      emit('cutout_failed', {
        runtime: cutoutPlan?.model.runtime,
        reason: cutoutFailureReason(e),
        ms: Date.now() - startedAt,
      });
      /*
       * Trace de diagnostic, **jamais active pour un participant**.
       *
       * `cutoutErrorMessage()` traduit toute panne en six messages actionnables :
       * c'est le bon contrat à l'écran et un mauvais outil de diagnostic. Quand
       * le message générique s'affiche alors que le moteur tourne, la cause
       * interne n'est visible nulle part. Le drapeau `?detourage=debug` l'expose,
       * et il faut le poser **explicitement** — un parcours normal ne journalise
       * rien.
       *
       * Ce qui est journalisé : la **pile** de l'erreur. Ce qui ne l'est pas : la
       * photo, son contenu, ni sa source — une erreur nomme un fichier ou une
       * URL, jamais l'image du participant.
       */
      if (typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('detourage') === 'debug') {
        console.error('[détourage] échec — raison :', cutoutFailureReason(e), '\nerreur brute :', e);
      }
      setCutoutAttempt({ status: 'failed', original, message: cutoutErrorMessage(e) });
      return original;
    } finally {
      clearTimeout(lent);
    }
  }, [cutoutPlan]);

  /**
   * Le filigrane suit la formule du **créateur** — le participant n'en a pas.
   * La projection publique expose ce seul booléen, jamais la formule.
   *
   * La règle elle-même (« qui porte le badge ») vit dans
   * `lib/watermark-policy.ts` : elle est appelée ici, par les vignettes de
   * galerie et par l'export. Recopiée, elle finirait par diverger, et l'aperçu
   * mentirait sur le fichier.
   *
   * En accès public (`/c/[slug]`), le badge est posé même pour un cadre Pro :
   * c'est ce qui distingue une campagne *distribuée* par son créateur d'un cadre
   * simplement publié, que n'importe qui peut réutiliser depuis la galerie.
   */
  const creatorWatermark = campaign?.creator?.watermark ?? true;
  const watermarkInput = {
    access: sharing ? ('public' as const) : ('distributed' as const),
    creatorWatermark,
  };
  const showWatermark = shouldWatermark(watermarkInput);
  const exportPlan: PlanId = exportPlanFor(watermarkInput);

  /**
   * Le badge vient-il **uniquement** de l'accès public — c'est-à-dire posé
   * malgré un créateur Pro ? C'est ce cas qui change le texte de la bannière :
   * promettre « une formule payante le retire » serait faux pour ce participant.
   */
  const fromPublicOnly = showWatermark && !creatorWatermark;

  /** Descripteur effectivement rendu : le cadre du créateur + les calques du participant. */
  const composed = useMemo(
    () => (frame ? composeDescriptor(frame, photo, placement, style) : null),
    [frame, photo, placement, style],
  );

  const animated = Boolean(frame?.motion);

  /**
   * Le quota est-il épuisé ? `null` = pas encore lu, donc on ne suppose jamais
   * que le lien est ouvert.
   */
  const blocked = distributionToken ? privateClosed : quota !== null && !quota.open;
  const accessUnknown = distributionToken ? !privateAccessReady : quota === null;
  const left = quota ? remaining(quota.used, quota.quota) : null;

  /**
   * La bulle « Promo » du pass apparaît-elle ?
   *
   * Quatre conditions, et chacune a une raison :
   *   - `sharing` : jamais sur un lien privé — le client a acheté sa diffusion,
   *     on ne revend rien à ses invités ;
   *   - `showWatermark` : s'il n'y a pas de badge, il n'y a rien à retirer ;
   *   - `!blocked` : un pass retire le filigrane, il ne rouvre pas un quota
   *     épuisé. La promettre sur une campagne fermée serait un mensonge ;
   *   - `!accessUnknown` : on ne sollicite pas avant de savoir si la campagne
   *     accepte encore des téléchargements. Afficher puis retirer la bulle une
   *     seconde plus tard est pire que de ne rien montrer ;
   *   - `!isVideoCampaign` : le pass porte sur le **PNG**. Une vidéo garde le
   *     badge dans tous les cas (voir `renderFile`) — le proposer ici ferait
   *     payer un retrait qui n'aurait pas lieu.
   */
  const showPassPromo =
    sharing && showWatermark && !blocked && !accessUnknown && !isVideoCampaign;

  /* ---------------- Choix de la photo ---------------- */
  const choosePhoto = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      setReading(true);
      try {
        const next = await readPhotoFile(file);
        /*
         * Première photo ou remplacement ? La distinction n'est pas cosmétique :
         * remplacer la photo doit laisser « Annuler » ramener la précédente,
         * alors que la toute première n'a rien à annuler — son historique doit
         * donc partir vide.
         */
        const replacing = photo !== null;

        /*
         * L'accord se demande **avant** le téléchargement, et il se demande sur
         * la photo déjà affichée : le participant voit ce qu'il a choisi pendant
         * qu'il décide. Le détourage attend son accord ; la photo, non.
         */
        if (isCutoutCampaign && cutoutPlan?.needsConsent && !consentGranted) {
          setCutoutAttempt(null);
          setAskingConsent(true);
          setPhoto(next, initialPlacement(next, zone, fit), !replacing);
          emit('photo_imported', { kind: campaign?.kind });
          return;
        }

        const effective = isCutoutCampaign ? await applyCutout(next) : next;
        setPhoto(effective, initialPlacement(effective, zone, fit), !replacing);
        /*
         * L'événement porte le **type** de campagne, jamais son nom, son
         * identifiant ni son lien : c'est ce qui permet de comparer les parcours
         * sans savoir de quelle campagne il s'agit.
         */
        emit('photo_imported', { kind: campaign?.kind });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Cette image n'a pas pu être ouverte.");
      } finally {
        setReading(false);
      }
    },
    [campaign, zone, photo, setPhoto, fit, isCutoutCampaign, cutoutPlan, consentGranted, applyCutout],
  );

  /**
   * Rejoue le détourage sur l'**original**, jamais sur le résultat.
   *
   * Détourer une photo déjà détourée n'a pas de sens : le masque s'appliquerait
   * à un sujet sans fond, et il ne resterait qu'un trou. C'est la raison pour
   * laquelle `original` est conservé dans les trois états de l'essai.
   *
   * Le placement courant est **conservé** : le détourage ne change pas les
   * dimensions, donc le cadrage choisi reste juste. Le recalculer ramènerait la
   * photo au centre sans raison, et le participant verrait son réglage disparaître.
   */
  const retryCutout = useCallback(async () => {
    const attempt = cutoutAttempt;
    if (!attempt) return;
    setReading(true);
    try {
      const effective = await applyCutout(attempt.original);
      setPhoto(effective, placement ?? initialPlacement(effective, zone, fit), false);
    } finally {
      setReading(false);
    }
  }, [cutoutAttempt, applyCutout, setPhoto, placement, zone, fit]);

  /**
   * L'accord donné : on détoure la photo déjà affichée, qui est l'original.
   *
   * `consentGranted` est posé **avant** l'attente, et il le reste : reposer la
   * question à chaque photo ferait de l'accord une formalité qu'on clique sans
   * lire, c'est-à-dire l'inverse de ce qu'il est censé être.
   */
  const grantCutoutConsent = useCallback(async () => {
    setAskingConsent(false);
    setConsentGranted(true);
    if (!photo) return;
    setReading(true);
    try {
      const effective = await applyCutout(photo);
      setPhoto(effective, placement ?? initialPlacement(effective, zone, fit), false);
    } finally {
      setReading(false);
    }
  }, [photo, applyCutout, setPhoto, placement, zone, fit]);

  /* ---------------- Choix de la vidéo ---------------- */
  const chooseVideo = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      setReading(true);
      try {
        const next = await readVideoFile(file);

        /*
         * L'élément média est créé ici, une fois pour toutes : c'est lui que la
         * scène dessine, et lui que le participant pilote. Il vit hors écran —
         * 0 × 0, invisible — mais reste **dans le document** : certains
         * navigateurs cessent de décoder un média détaché, et l'aperçu se
         * figerait sans que rien ne le signale.
         */
        const element = document.createElement('video');
        element.src = next.src;
        element.preload = 'auto';
        element.playsInline = true;
        element.setAttribute('playsinline', '');
        element.crossOrigin = 'anonymous';
        /*
         * `createVideoObject` renseigne `width`/`height` sur l'élément pour que
         * Fabric sache le mesurer : on neutralise donc la mise en page ici, sinon
         * un média de 1920 px élargirait la page.
         */
        element.style.position = 'absolute';
        element.style.width = '0';
        element.style.height = '0';
        element.style.opacity = '0';
        element.style.pointerEvents = 'none';

        await new Promise<void>((resolve, reject) => {
          const ok = () => resolve();
          const ko = () =>
            reject(new Error('Cette vidéo ne peut pas être relue. Essayez un autre fichier.'));
          element.addEventListener('loadeddata', ok, { once: true });
          element.addEventListener('error', ko, { once: true });
          element.load();
        });

        /*
         * Même règle que pour la photo : remplacer laisse « Annuler » ramener la
         * précédente, la toute première n'a rien à annuler.
         */
        const replacing = clip !== null;
        setClip(next);
        setClipStartMs(0);
        setVideoEl(element);

        const pseudo = pseudoPhoto(next);
        setPhoto(pseudo, initialPlacement(pseudo, zone, fit), !replacing);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Cette vidéo n'a pas pu être ouverte.");
      } finally {
        setReading(false);
      }
    },
    [zone, clip, setPhoto, fit],
  );

  /* ---------------- Cycle de vie de l'élément vidéo ---------------- */

  /**
   * L'élément est monté dans un conteneur hors écran, puis **démonté** avec son
   * flux : sans cela, chaque essai de fichier laisserait un décodeur ouvert et
   * une URL d'objet retenue en mémoire jusqu'au rechargement de la page.
   */
  useEffect(() => {
    if (!videoEl) return;
    const holder = videoHolderRef.current;
    if (holder && videoEl.parentNode !== holder) holder.appendChild(videoEl);

    return () => {
      try {
        videoEl.pause();
      } catch {
        /* déjà arrêté */
      }
      videoEl.removeAttribute('src');
      try {
        videoEl.load();
      } catch {
        /* élément déjà détaché */
      }
      videoEl.remove();
    };
  }, [videoEl]);

  /** L'URL d'objet n'a de sens que tant que le clip est celui du participant. */
  useEffect(() => {
    if (!clip) return;
    return () => URL.revokeObjectURL(clip.src);
  }, [clip]);

  /**
   * La fenêtre réellement retenue — 30 s au plus, à partir du début choisi.
   *
   * Elle est calculée par la fonction partagée avec l'export : l'aperçu et le
   * fichier ne peuvent donc pas décrire deux extraits différents.
   */
  const activeWindow = useMemo(
    () => (clip ? clipWindow(clip.durationMs, clipStartMs) : null),
    [clip, clipStartMs],
  );

  /**
   * La lecture s'arrête au bout de l'extrait.
   *
   * Une source de deux minutes ne doit pas se dérouler entièrement à l'aperçu :
   * le participant croirait que son clip final durera aussi longtemps. On
   * reboucle sur le début de la fenêtre, comme un lecteur de statut vidéo.
   */
  useEffect(() => {
    const element = videoEl;
    const win = activeWindow;
    if (!element || !win) return;

    let frame = 0;
    const loop = () => {
      if (!element.paused && element.currentTime * 1000 >= win.endMs) {
        element.pause();
        element.currentTime = win.startMs / 1000;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [videoEl, activeWindow]);

  /** Déplacer le curseur d'extrait repositionne l'aperçu sur la nouvelle entrée. */
  useEffect(() => {
    const element = videoEl;
    if (!element) return;
    element.pause();
    try {
      element.currentTime = clipStartMs / 1000;
    } catch {
      /* la source n'est pas encore prête */
    }
  }, [clipStartMs, videoEl]);

  /** Le bouton suit l'état réel du média, y compris une pause du navigateur. */
  useEffect(() => {
    const element = videoEl;
    if (!element) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    element.addEventListener('play', onPlay);
    element.addEventListener('pause', onPause);
    return () => {
      element.removeEventListener('play', onPlay);
      element.removeEventListener('pause', onPause);
    };
  }, [videoEl]);

  const togglePlayback = useCallback(() => {
    const element = videoEl;
    const win = activeWindow;
    if (!element || !win) return;

    if (!element.paused) {
      element.pause();
      return;
    }

    const position = element.currentTime * 1000;
    if (position < win.startMs || position >= win.endMs - 50) {
      element.currentTime = win.startMs / 1000;
    }
    void element
      .play()
      .catch(() => setError("La lecture n'a pas pu démarrer sur cet appareil."));
  }, [videoEl, activeWindow]);

  /**
   * Export PNG **sans filigrane**, rendu par le serveur.
   *
   * C'est le seul chemin qui retire le badge. Le client n'envoie que ce qui lui
   * appartient — sa photo, son placement, son style — et reçoit une image déjà
   * composée. Il ne peut donc pas retirer le badge lui-même : la décision et le
   * dessin du badge vivent côté serveur, après vérification du pass.
   *
   * Le **quota** est réservé par le serveur (même fonction SQL que le parcours
   * public) : c'est ce qui empêche un détenteur de pass de contourner la limite
   * de la campagne en appelant la route directement. On récupère l'état du quota
   * dans les en-têtes pour garder l'écran juste.
   */
  const requestServerExport = useCallback(async (): Promise<{
    blob: Blob;
    used: number | null;
    quota: number | null;
  }> => {
    if (!campaign || !photo || !placement) throw new Error('Visuel incomplet.');
    const res = await fetch('/api/passes/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: campaign.slug,
        photo: {
          src: photo.src,
          naturalWidth: photo.naturalWidth,
          naturalHeight: photo.naturalHeight,
        },
        placement: { zoom: placement.zoom, x: placement.x, y: placement.y },
        style: { filter: style.filter, text: style.text },
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      // Quota épuisé : c'est le même refus que le parcours public, pas une panne.
      if (body.code === 'PASS_QUOTA_CLOSED') throw new Error(blockedMessage(campaign.name));
      if (res.status === 403) throw new Error('Votre pass n’est plus actif. Rechargez la page.');
      throw new Error('Le rendu sans filigrane a échoué. Réessayez dans un instant.');
    }

    const usedHeader = res.headers.get('X-Quota-Used');
    const totalHeader = res.headers.get('X-Quota-Total');
    const used = usedHeader ? Number(usedHeader) : NaN;
    const total = totalHeader ? Number(totalHeader) : NaN;

    return {
      blob: await res.blob(),
      used: Number.isFinite(used) ? used : null,
      quota: Number.isFinite(total) ? total : null,
    };
  }, [campaign, photo, placement, style]);

  /* ---------------- Export ---------------- */

  /**
   * Produit le fichier que le participant va recevoir.
   *
   * Une **seule** fabrique pour les deux médias et pour les trois chemins
   * d'export — lien privé, pass serveur, parcours public. C'est ce qui garantit
   * qu'un PNG et une vidéo décrivent le même cadre, portent le même badge et
   * suivent le même quota, quel que soit le chemin emprunté : trois copies de
   * cette logique finiraient par diverger sur un détail, et le détail se verrait
   * dans le fichier téléchargé.
   *
   * La vidéo n'est jamais téléversée : `exportVideoClip` relit l'URL d'objet
   * locale, compose dans un canvas hors écran à la résolution native du format,
   * et rend le fichier sur l'appareil.
   */
  const renderFile = useCallback(
    async (
      kind: 'png' | 'video',
      plan: PlanId | string,
    ): Promise<{ blob: Blob; filename: string }> => {
      if (!composed || !campaign) throw new Error('Visuel incomplet.');

      if (isVideoCampaign) {
        if (!clip) throw new Error('Choisissez une vidéo avant de télécharger.');
        const win = clipWindow(clip.durationMs, clipStartMs);
        const result = await exportVideoClip({
          descriptor: composed,
          plan,
          clip: { src: clip.src, width: clip.width, height: clip.height, hasAudio: clip.hasAudio },
          clipStartMs: win.startMs,
          clipDurationMs: win.durationMs,
          onProgress: (p) => setProgress(p.ratio),
        });
        return { blob: result.blob, filename: exportFilename(campaign.name, result.extension) };
      }

      if (kind === 'png') {
        const url = await exportPng({ descriptor: composed, plan });
        return { blob: dataUrlToBlob(url), filename: exportFilename(campaign.name, 'png') };
      }

      const video = await exportVideo({
        descriptor: composed,
        plan,
        onProgress: (p) => setProgress(p.ratio),
      });
      return { blob: video.blob, filename: exportFilename(campaign.name, video.extension) };
    },
    [composed, campaign, isVideoCampaign, clip, clipStartMs],
  );

  /** Ce que le participant vient réellement d'obtenir : une vidéo, ou une image. */
  const savedMessage = isVideoCampaign ? 'Vidéo enregistrée ✓' : 'Image enregistrée ✓';

  const runExport = useCallback(
    async (kind: 'png' | 'video') => {
      if (!composed || !campaign || !photo || exportBusy.current || blocked || accessUnknown || (!sharing && !distributionToken)) return;
      if (isVideoCampaign && !clip) return;
      exportBusy.current = true;
      setError(null);
      setExporting(kind);
      setProgress(0);
      const exportStartedAt = Date.now();
      try {
        if (kind === 'video' && (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function')) {
          throw new Error(
            isVideoCampaign
              ? "Votre navigateur ne sait pas composer de vidéo. Essayez depuis un ordinateur ou un autre navigateur."
              : 'Votre navigateur ne sait pas produire de vidéo. Essayez le PNG.',
          );
        }
        if (distributionToken) {
          if (!exportCoordinator.current) {
            const key = `campagnes.export.v1.${await technicalHash(distributionToken)}`;
            exportCoordinator.current = new PrivateExportCoordinator(sessionStorage, key,
              (action, operation) => distributionService.exportOperation(action, distributionToken, operation));
          }
          const fingerprint = await technicalHash(JSON.stringify(composed));
          const file = await exportCoordinator.current.run(kind, fingerprint, () =>
            renderFile(kind, exportPlan),
          );
          setConfirmedFile(file);
          downloadBlob(file.blob, file.filename);
          notify(savedMessage);
          return;
        }
        /*
         * Pass « Sans filigrane » actif : le PNG est rendu par le serveur, sans
         * badge. Le serveur réserve lui-même l'unité de quota (même fonction
         * SQL que ci-dessous) — on ne la réserve donc pas deux fois ici.
         */
        if (kind === 'png' && pass.active && sharing) {
          const { blob, used, quota: total } = await requestServerExport();
          if (used !== null && total !== null) {
            setQuota({ used, quota: total, open: used < total });
          }
          downloadBlob(blob, exportFilename(campaign.name, 'png'));
          notify('Image enregistrée ✓');
          void backend.recordShareEvent(campaign.id, 'share_download').catch(() => {});
          return;
        }

        /*
         * Le quota est réservé **avant** le rendu, jamais après : un export
         * coûteux que personne ne pourrait récupérer ne doit pas consommer une
         * place. La réservation est atomique côté base, donc deux participants
         * simultanés ne peuvent pas prendre deux fois la dernière place.
         *
         * Quel quota ? Celui du **lien privé** quand le parcours est servi par
         * `/d/[token]`, celui de la campagne sinon. Les deux compteurs sont
         * indépendants par construction : le lien mesure la diffusion vendue à
         * un client, la campagne mesure l'enveloppe globale du créateur.
         */
        const claim = await backend.claimParticipation(campaign.id);
        if (claim.error) throw new Error(claim.error);
        // La fonction renvoie toujours une ligne, mais le type ne peut pas le
        // garantir : on ne rend jamais un export sur une réservation incertaine.
        const result = claim.data;
        if (!result) throw new Error("La réservation n'a pas abouti. Réessayez dans un instant.");

        setQuota({ used: result.used, quota: result.quota, open: result.granted });

        if (!result.granted) {
          /*
           * Réponse fermée par défaut : un lien épuisé, expiré ou révoqué
           * n'annonce pas « erreur », il ferme l'export avec un état explicite.
           * Et la fonction SQL rend un jeton inconnu INDISCERNABLE d'un quota
           * atteint — on ne confirme jamais qu'un jeton existe, puisque c'est un
           * secret. Le message ne dit donc pas « votre lien n'existe pas ».
           */
          throw new Error(
            distributionToken ? privateLinkBlockedMessage() : blockedMessage(campaign.name),
          );
        }

        const file = await renderFile(kind, exportPlan);
        downloadBlob(file.blob, file.filename);

        notify(savedMessage);

        /*
         * L'export est le seul moment où l'on sait que le participant est
         * **reparti avec son visuel**. La durée est mesurée, mais rien de ce qui
         * a été produit ne l'est : ni le fichier, ni son nom, ni la photo.
         */
        emit('export_ok', { kind: campaign.kind, ms: Date.now() - exportStartedAt });

        /*
         * Le téléchargement est le seul instant du parcours que la plateforme
         * observe réellement : le participant peut copier un lien sans qu'elle
         * le voie, mais elle le voit télécharger. Il compte donc comme un
         * partage — c'est ce que le créateur appelle « ça a circulé ».
         *
         * L'échec est avalé : le visuel est déjà dans les mains du participant,
         * un compteur en panne ne le lui reprendra pas.
         */
        void backend.recordShareEvent(campaign.id, 'share_download').catch(() => {});
      } catch (e) {
        if (e instanceof PrivateExportUnavailable) setPrivateClosed(true);
        setError(e instanceof Error ? e.message : "L'enregistrement a échoué.");
      } finally {
        exportBusy.current = false;
        setExporting(null);
        setProgress(0);
      }
    },
    [campaign, composed, photo, clip, distributionToken, exportPlan, blocked, accessUnknown, sharing, notify, pass.active, requestServerExport, renderFile, isVideoCampaign, savedMessage],
  );

  const runWatermarkedExport = useCallback(
    async (kind: 'png' | 'video') => {
      if (!composed || !campaign || distributionToken || !sharing || exportBusy.current) return;
      if (isVideoCampaign && !clip) return;
      setError(null);
      setExporting(kind);
      setProgress(0);
      const exportStartedAt = Date.now();
      try {
        const file = await renderFile(kind, 'free');
        downloadBlob(file.blob, file.filename);
        notify(savedMessage);
        emit('export_ok', { kind: campaign.kind, ms: Date.now() - exportStartedAt });
      } catch (e) {
        setError(e instanceof Error ? e.message : "L'enregistrement a échoué.");
      } finally {
        setExporting(null);
        setProgress(0);
      }
    },
    [campaign, composed, distributionToken, sharing, notify, renderFile, isVideoCampaign, clip, savedMessage],
  );

  /* ---------------- États transitoires ---------------- */
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-5 text-gray-400" />
      </div>
    );
  }

  if (!campaign || !frame) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 text-center">
        <Logo size="lg" asLink={true} />
        <p className="max-w-sm text-sm leading-relaxed text-gray-500">
          {campaign
            ? "Cette campagne n'a pas encore de cadre. Son créateur doit en enregistrer un avant qu'elle puisse être partagée."
            : "Ce lien ne correspond à aucune campagne publiée. Il a peut-être été retiré, ou l'adresse est incomplète."}
        </p>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-[13px] text-gray-500 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Retour à l’accueil
        </Link>
      </div>
    );
  }

  const creatorLabel = campaign.creator
    ? campaign.creator.org_name || `@${campaign.creator.username}`
    : null;

  const axes = photo && placement ? movableAxes(photo, zone, placement.zoom) : null;
  const addOrEditText = () => {
    setStyle((current) => ({
      ...current,
      text: current.text
        ? current.text
        : { ...defaultParticipantText(zone, ratio), content: 'Votre texte' },
    }));
    setActivePanel('text');
    setTextFocusKey((key) => key + 1);
  };

  return (
    <div className="min-h-dvh bg-white">
      {/* ---------------- En-tête minimal ----------------
          Le participant vient faire une chose précise : on ne met rien qui
          puisse détourner son attention avant qu'il ait son visuel. */}
      <header className="border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="container-shell flex h-14 items-center justify-between gap-4 md:h-16">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9 px-3">
              <Eye className="size-3.5" aria-hidden />
              Aperçu
            </Button>
            <button
              type="button"
              aria-label="Plus d’options"
              className="flex size-9 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition-colors hover:border-ink hover:bg-gray-50"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main
        className={cn(
          'container-shell py-4 md:py-8',
          /*
           * Réserve la place du badge promo flottant (`WatermarkPassButton`),
           * qui est en `position: fixed` et ne pousse donc rien.
           *
           * La valeur suit la **taille du badge**, pas l'inverse : 128 px de
           * haut + 16 px de marge basse sur mobile, 160 px + 16 px à partir de
           * `md`. Changer `size-32`/`md:size-40` dans le composant oblige à
           * changer ces deux valeurs, sinon le badge recouvre le bloc
           * « Vous organisez votre propre campagne ? » en fin de page.
           */
          showPassPromo && 'pb-40 md:pb-48',
        )}
      >
        <div className="mx-auto max-w-2xl">
          {/* ---------------- Titre ---------------- */}
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-gray-200 px-3 py-1 text-[11px] font-medium text-gray-500">
              <ShieldCheck className="size-3.5" aria-hidden />
              {isVideoCampaign
                ? 'Votre vidéo reste sur votre appareil'
                : 'Votre photo est traitée sur votre appareil'}
            </span>
            {clientLogoUrl && (
              <img
                src={clientLogoUrl}
                alt="Logo client"
                className="mx-auto mt-4 block max-h-12 w-auto object-contain"
              />
            )}
            <h1 className="mt-3 text-[20px] font-bold leading-tight md:text-[24px]">
              {campaign.name}
            </h1>
            {creatorLabel && (
              <p className="mt-1 text-[12px] text-gray-500">
                Créé par <span className="font-medium text-ink">{creatorLabel}</span>
              </p>
            )}
          </div>

          {/*
            Une seule colonne : le participant ne fait qu'une chose à la fois.
            Les réglages vivent sous l'aperçu, pas dans un panneau à côté — le
            regard ne quitte jamais le visuel qu'il est en train de composer.
          */}
          <div className="mt-6 md:mt-8">
            {/* ---------------- Scène ---------------- */}
            <div className="min-w-0">
              {/*
                L'état du détourage, au-dessus du visuel.

                Il n'apparaît que sur une campagne `subject: 'cutout'`, et
                seulement quand il y a quelque chose à dire. Un bandeau
                « tout va bien » n'apprendrait rien et déplacerait le canvas à
                chaque détourage.
              */}
              {isCutoutCampaign && (askingConsent || cutoutAttempt) ? (
                <div className="mb-3">
                  {askingConsent && cutoutPlan ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                      <p className="text-[13px] font-medium text-amber-900">
                        Votre connexion est facturée au volume.
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
                        Le détourage doit télécharger son moteur — environ{' '}
                        {formatBytes(firstLoadTransferBytes(cutoutPlan.model))}. Votre photo, elle,
                        ne quitte pas votre appareil.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="primary" size="sm" onClick={() => void grantCutoutConsent()}>
                          Détourer ma photo
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setAskingConsent(false)}>
                          Continuer sans détourer
                        </Button>
                      </div>
                    </div>
                  ) : cutoutAttempt?.status === 'running' ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
                      <p className="flex items-center gap-2 text-[13px] text-gray-600">
                        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                        {cutoutAttempt.message}
                      </p>
                      {typeof cutoutAttempt.ratio === 'number' ? (
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-ink transition-[width] duration-200"
                            style={{ width: `${Math.round(cutoutAttempt.ratio * 100)}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : cutoutAttempt?.status === 'failed' ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                      <p className="text-[13px] font-medium text-amber-900">
                        Le détourage n’a pas abouti.
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
                        {cutoutAttempt.message}
                      </p>
                      <div className="mt-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void retryCutout()}
                          disabled={reading}
                        >
                          Réessayer
                        </Button>
                      </div>
                    </div>
                  ) : cutoutAttempt?.status === 'done' && cutoutAttempt.outcome === 'warn' ? (
                    /*
                     * Le cas `plein` est le plus trompeur : l'image paraît
                     * normale, et sans ce message le participant croirait que le
                     * fond a été retiré alors qu'il ne l'a pas été.
                     */
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                      <p className="text-[13px] leading-relaxed text-amber-800">
                        {cutoutAttempt.message}
                      </p>
                      <div className="mt-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void retryCutout()}
                          disabled={reading}
                        >
                          Réessayer
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {photo && placement ? (
                <ParticipantStage
                  descriptor={frame}
                  photo={photo}
                  placement={placement}
                  style={style}
                  /*
                   * Sur une campagne vidéo, la scène dessine l'image courante de
                   * l'élément média à la place de la photo. Le calque, la zone et
                   * la découpe restent ceux d'une photo de mêmes dimensions : le
                   * cadre ne sait pas ce qu'il encadre.
                   */
                  video={isVideoCampaign ? videoEl : null}
                  watermark={(showWatermark && !pass.active) || blocked}
                  textFocusKey={textFocusKey}
                  onPlacementChange={setPlacementFromCanvas}
                  onTextChange={setTextFromCanvas}
                />
              ) : (
                /* ---------------- Dépôt du média ---------------- */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    void (isVideoCampaign ? chooseVideo(file) : choosePhoto(file));
                  }}
                  className={
                    'relative flex min-h-[320px] flex-col items-center justify-center gap-5 overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)] transition-colors md:p-8 ' +
                    (dragging ? 'border-purple bg-purple/5' : 'border-gray-200 bg-white')
                  }
                >
                  {campaign.frame?.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={campaign.frame.thumbnail_url}
                      alt={`Aperçu du cadre ${campaign.name}`}
                      className="max-h-56 max-w-full rounded-md object-contain shadow-sm"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="rounded-md border-2 border-gray-300 bg-white"
                      style={{
                        width: ratio === '16:9' ? 200 : ratio === '9:16' ? 112 : 150,
                        height: ratio === '16:9' ? 112 : ratio === '9:16' ? 200 : 150,
                      }}
                    />
                  )}

                  <div>
                    <p className="text-sm font-medium">
                      {isVideoCampaign ? 'Déposez votre vidéo ici' : 'Déposez votre photo ici'}
                    </p>
                    <p className="mt-1 text-[13px] text-gray-500">
                      ou choisissez-la depuis votre appareil
                    </p>
                  </div>

                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={reading}
                  >
                    {reading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        {/*
                          Le libellé suit ce qui se passe réellement : pendant un
                          détourage, « Ouverture… » serait faux — le fichier est
                          déjà lu, c'est le modèle qui travaille.
                        */}
                        {cutoutAttempt?.status === 'running' ? 'Détourage…' : 'Ouverture…'}
                      </>
                    ) : isVideoCampaign ? (
                      <>
                        <Video className="size-4" aria-hidden />
                        Choisir ma vidéo
                      </>
                    ) : (
                      <>
                        <ImagePlus className="size-4" aria-hidden />
                        Choisir ma photo
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-gray-400">
                    {isVideoCampaign
                      ? `Format ${spec.label.toLowerCase()} · MP4, MOV ou WebM · 30 secondes maximum`
                      : `Format ${spec.label.toLowerCase()} · JPG, PNG ou WebP`}
                  </p>
                </div>
              )}

              {/*
                Conteneur hors écran de l'élément média.
                Il n'est pas en `display: none` : un média caché de la sorte cesse
                d'être décodé par certains navigateurs, et l'aperçu se figerait
                sans que rien ne l'explique. Il reste donc rendu, mais en 0 × 0.
              */}
              <div
                ref={videoHolderRef}
                aria-hidden
                style={{
                  position: 'absolute',
                  width: 0,
                  height: 0,
                  overflow: 'hidden',
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept={isVideoCampaign ? 'video/*' : 'image/*'}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  void (isVideoCampaign ? chooseVideo(file) : choosePhoto(file));
                  // Sans cette remise à zéro, rechoisir le MÊME fichier ne
                  // déclencherait aucun `change` — le bouton semblerait cassé.
                  e.target.value = '';
                }}
              />
            </div>

            {photo && placement ? (
              <>
                {/*
                  Barre d'actions principale — l'unique barre du parcours.

                  Tout ce qui était affiché en permanence (zoom, filtres, réglages
                  de texte) passe derrière « Ajuster » ou « Texte » : le canvas est
                  le point focal, et une page où six réglages et deux blocs de
                  texte se disputent l'attention n'est pas une page d'édition.

                  L'ordre suit la spec : changer la photo, ajouter du texte,
                  ajuster, télécharger. Le téléchargement est l'action principale
                  — c'est ce que le participant est venu faire.
                */}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={reading}
                    className="min-h-[44px]"
                  >
                    {isVideoCampaign ? (
                      <Video className="size-4" aria-hidden />
                    ) : (
                      <ImagePlus className="size-4" aria-hidden />
                    )}
                    {isVideoCampaign ? 'Changer de vidéo' : 'Changer de photo'}
                  </Button>

                  <Button
                    variant="secondary"
                    size="md"
                    onClick={addOrEditText}
                    className="min-h-[44px]"
                  >
                    <Type className="size-4" aria-hidden />
                    {style.text ? 'Modifier le texte' : 'Ajouter un texte'}
                  </Button>

                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setActivePanel((p) => (p === 'adjust' ? null : 'adjust'))}
                    aria-expanded={activePanel === 'adjust'}
                    aria-controls="panneau-ajuster"
                    className="min-h-[44px]"
                  >
                    <SlidersHorizontal className="size-4" aria-hidden />
                    Ajuster
                  </Button>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => void runExport(isVideoCampaign ? 'video' : 'png')}
                    disabled={exporting !== null || blocked || accessUnknown}
                    className="col-span-2 min-h-[48px] sm:col-span-1 sm:min-h-[44px]"
                  >
                    {exporting !== null ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        {isVideoCampaign && progress > 0
                          ? `Composition… ${Math.round(progress * 100)} %`
                          : 'Préparation…'}
                      </>
                    ) : isVideoCampaign ? (
                      <>
                        <Video className="size-4" aria-hidden />
                        Télécharger la vidéo
                      </>
                    ) : (
                      <>
                        <Download className="size-4" aria-hidden />
                        Télécharger
                      </>
                    )}
                  </Button>
                </div>

                {/*
                  ---------------- Clip vidéo : aperçu et extrait ----------------

                  Le participant doit pouvoir **voir** ce qu'il va télécharger, et
                  choisir le passage quand sa vidéo dépasse la limite. Les deux
                  contrôles vivent sous l'aperçu, au même endroit que les autres
                  réglages : le regard ne quitte jamais le visuel.

                  Le curseur n'apparaît que si la source dépasse 30 s. Une vidéo
                  déjà courte n'a rien à découper — afficher un curseur inerte
                  ferait croire à une étape obligatoire.
                */}
                {isVideoCampaign && clip && (
                  <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm md:p-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={togglePlayback}
                        aria-label={playing ? 'Mettre en pause' : 'Lire la vidéo'}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-transform active:scale-95"
                      >
                        {playing ? (
                          <Pause className="size-4" aria-hidden />
                        ) : (
                          <Play className="size-4" aria-hidden />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-800">
                          {formatClipDuration(activeWindow?.durationMs ?? 0)} · {clip.width} ×{' '}
                          {clip.height}
                        </p>
                        <p className="mt-0.5 text-[12px] text-gray-500">
                          {fitsWithinLimit(clip.durationMs)
                            ? 'Votre vidéo entière sera utilisée.'
                            : `Extrait de 30 s choisi dans une vidéo de ${formatClipDuration(clip.durationMs)}.`}
                        </p>
                      </div>
                    </div>

                    {!fitsWithinLimit(clip.durationMs) && (
                      <div className="mt-3">
                        <input
                          type="range"
                          min={0}
                          max={maxClipStart(clip.durationMs)}
                          step={CLIP_STEP_MS}
                          value={clipStartMs}
                          onChange={(e) => setClipStartMs(Number(e.target.value))}
                          className="w-full accent-purple"
                          aria-label="Début de l’extrait de 30 secondes"
                        />
                        <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-gray-500">
                          <span>{formatClipDuration(activeWindow?.startMs ?? 0)}</span>
                          <span>Début de l’extrait</span>
                          <span>{formatClipDuration(activeWindow?.endMs ?? 0)}</span>
                        </div>
                      </div>
                    )}

                    {exporting === 'video' && (
                      <div className="mt-3 h-1 w-full overflow-hidden rounded-pill bg-gray-100">
                        <div
                          className="h-full bg-brand-gradient transition-[width] duration-150"
                          style={{ width: `${Math.round(progress * 100)}%` }}
                        />
                      </div>
                    )}

                    {/*
                      Le pass « Sans filigrane » porte sur le PNG : il n'est donc
                      pas proposé ici (voir `showPassPromo`). Le dire évite qu'un
                      participant le cherche, ou croie à un oubli.
                    */}
                    {showWatermark && (
                      <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] leading-relaxed text-gray-500">
                        Le badge « Créé avec Campagnes » est toujours présent sur la vidéo.
                      </p>
                    )}
                  </div>
                )}

                {/* ---------------- Panneau « Ajuster » : position (et filtres) ----------------
                    Le zoom est un ajustement du média, pas une action : il n'a rien
                    à faire sur la barre principale. Le filtre n'y figure que sur une
                    campagne photo — voir plus bas. */}
                {activePanel === 'adjust' && (
                  <div id="panneau-ajuster" className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm md:p-4">
                    <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Réduire"
                      disabled={placement.zoom <= MIN_ZOOM + 1e-9}
                      onClick={() =>
                        setPlacement((current) =>
                          current
                            ? zoomAroundCenter(photo, zone, current, current.zoom - 0.2, fit)
                            : current,
                        )
                      }
                      className="flex size-10 shrink-0 items-center justify-center rounded-pill border border-gray-200 text-gray-700 transition-colors hover:border-ink disabled:opacity-35 disabled:hover:border-gray-200"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>

                    <input
                      type="range"
                      min={MIN_ZOOM}
                      max={MAX_ZOOM}
                      step={0.01}
                      value={placement.zoom}
                      onChange={(e) =>
                        setPlacement((current) =>
                          current
                            ? zoomAroundCenter(photo, zone, current, Number(e.target.value), fit)
                            : current,
                        )
                      }
                      className="min-w-0 flex-1 accent-purple"
                      aria-label={isVideoCampaign ? 'Zoom de la vidéo' : 'Zoom de la photo'}
                    />

                    <button
                      type="button"
                      aria-label="Agrandir"
                      disabled={placement.zoom >= MAX_ZOOM - 1e-9}
                      onClick={() =>
                        setPlacement((current) =>
                          current
                            ? zoomAroundCenter(photo, zone, current, current.zoom + 0.2, fit)
                            : current,
                        )
                      }
                      className="flex size-10 shrink-0 items-center justify-center rounded-pill border border-gray-200 text-gray-700 transition-colors hover:border-ink disabled:opacity-35 disabled:hover:border-gray-200"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>

                    <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-gray-500">
                      {placement.zoom.toFixed(1)}×
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPlacement(initialPlacement(photo, zone, fit))}
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      Recentrer
                    </Button>
                    {/* « Changer de photo » est passé sur la barre principale :
                        l'action est toujours à un cran, et le panneau ne garde que
                        les ajustements. */}

                    {/*
                      Annuler / rétablir.
                      Les deux boutons ne disparaissent jamais : ils s'éteignent.
                      Un bouton qui s'évapore fait sauter les voisins sous le
                      doigt, et le participant croit que l'interface a changé
                      d'avis.
                    */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={history.undo}
                      disabled={!history.canUndo}
                      aria-label="Annuler la dernière modification"
                    >
                      <Undo2 className="size-3.5" aria-hidden />
                      Annuler
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={history.redo}
                      disabled={!history.canRedo}
                      aria-label="Rétablir la modification annulée"
                    >
                      <Redo2 className="size-3.5" aria-hidden />
                      Rétablir
                    </Button>
                  </div>

                  <p className="mt-3 text-center text-[12px] text-gray-500">
                    {axes && axes.x && axes.y
                      ? `Faites glisser ${isVideoCampaign ? 'la vidéo' : 'la photo'} pour la positionner.`
                      : `Zoomez pour pouvoir déplacer ${isVideoCampaign ? 'la vidéo' : 'la photo'}.`}
                  </p>

                {/* ---------------- Filtre ----------------
                    Six choix, une ligne, aucun réglage à comprendre. Le filtre
                    est porté par le descripteur, donc l'aperçu et le fichier
                    téléchargé montrent forcément la même image.

                    Absent sur une campagne vidéo : les filtres opèrent sur une
                    image immuable, alors qu'ici les pixels changent à chaque
                    image. Les proposer sans pouvoir les garantir à l'export
                    ferait exactement ce que tout le projet s'interdit — un
                    aperçu qui montre autre chose que le fichier livré. */}
                {!isVideoCampaign && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <span className="text-[13px] font-semibold text-gray-700">Filtre</span>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PHOTO_FILTER_PRESETS.map((preset) => {
                      const active = style.filter === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setStyle((current) => ({ ...current, filter: preset.id }))
                          }
                          className={cn(
                            'rounded-pill border px-3.5 py-2 text-[13px] transition-colors duration-150 ease-brand',
                            active
                              ? 'border-ink bg-ink text-white'
                              : 'border-gray-200 text-gray-700 hover:border-ink',
                          )}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                )}
                  </div>
                )}

                {/* ---------------- Panneau « Texte » ----------------
                    Le texte se saisit dans ce panneau, et se déplace sur le canvas.
                    Les deux restent vrais : sur un téléphone, un champ est plus sûr
                    qu'un double-clic au doigt ; le canvas sert à le poser.

                    Le panneau n'existe que lorsqu'il y a un texte — sinon il n'y a
                    rien à régler, et une carte vide sous le canvas serait du bruit. */}
                {activePanel === 'text' && style.text && (
                <div id="panneau-texte" className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-semibold text-gray-700">Texte</span>
                    {style.text && (
                      <button
                        type="button"
                        onClick={() => setStyle((current) => ({ ...current, text: null }))}
                        className="flex items-center gap-1 text-[13px] text-gray-500 transition-colors hover:text-error"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Retirer
                      </button>
                    )}
                  </div>

                  {style.text ? (
                    <div className="mt-3 flex flex-col gap-3">
                      {/* 1. Saisie directe du texte */}
                      <Input
                        value={style.text.content}
                        onChange={(e) =>
                          setStyle((current) =>
                            current.text
                              ? {
                                  ...current,
                                  text: {
                                    ...current.text,
                                    content: e.target.value.slice(0, TEXT_MAX_LENGTH),
                                  },
                                }
                              : current,
                          )
                        }
                        placeholder="Votre texte"
                        maxLength={TEXT_MAX_LENGTH}
                        className="rounded-xl border-gray-200 bg-gray-50/70 text-center font-medium text-ink focus:bg-white"
                        aria-label="Votre texte"
                      />

                      {/* 2. Ligne 1 : Sélecteur de Police < Roboto > */}
                      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <button
                          type="button"
                          aria-label="Police précédente"
                          onClick={() => {
                            const idx = FONTS.findIndex((f) => f.value === (style.text?.font ?? 'Inter'));
                            const prev = FONTS[(idx - 1 + FONTS.length) % FONTS.length];
                            setStyle((current) =>
                              current.text ? { ...current, text: { ...current.text, font: prev.value } } : current,
                            );
                          }}
                          className="flex size-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 active:scale-95"
                        >
                          <ChevronLeft className="size-4" />
                        </button>
                        <span className="text-sm font-semibold text-gray-800">
                          {FONTS.find((f) => f.value === (style.text?.font ?? 'Inter'))?.label ?? 'Inter'}
                        </span>
                        <button
                          type="button"
                          aria-label="Police suivante"
                          onClick={() => {
                            const idx = FONTS.findIndex((f) => f.value === (style.text?.font ?? 'Inter'));
                            const next = FONTS[(idx + 1) % FONTS.length];
                            setStyle((current) =>
                              current.text ? { ...current, text: { ...current.text, font: next.value } } : current,
                            );
                          }}
                          className="flex size-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 active:scale-95"
                        >
                          <ChevronRight className="size-4" />
                        </button>
                      </div>

                      {/* 3. Ligne 2 : Contrôleur de taille numérique + Barre [ B | I | U | S ] */}
                      <div className="flex items-center gap-2">
                        {/* Contrôleur numérique de taille */}
                        <div className="flex h-10 w-28 items-center justify-between rounded-xl border border-gray-200 bg-white px-2.5">
                          <input
                            type="number"
                            min={8}
                            max={160}
                            value={style.text.size}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val > 0) {
                                setStyle((current) =>
                                  current.text ? { ...current, text: { ...current.text, size: val } } : current,
                                );
                              }
                            }}
                            className="w-12 border-0 p-0 text-center text-sm font-semibold text-gray-800 focus:outline-none focus:ring-0"
                            aria-label="Taille du texte"
                          />
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              aria-label="Agrandir"
                              onClick={() =>
                                setStyle((current) =>
                                  current.text
                                    ? { ...current, text: { ...current.text, size: Math.min(160, current.text.size + 2) } }
                                    : current,
                                )
                              }
                              className="flex size-3.5 items-center justify-center text-gray-500 hover:text-ink active:scale-90"
                            >
                              <ChevronUp className="size-3" />
                            </button>
                            <button
                              type="button"
                              aria-label="Diminuer"
                              onClick={() =>
                                setStyle((current) =>
                                  current.text
                                    ? { ...current, text: { ...current.text, size: Math.max(8, current.text.size - 2) } }
                                    : current,
                                )
                              }
                              className="flex size-3.5 items-center justify-center text-gray-500 hover:text-ink active:scale-90"
                            >
                              <ChevronDown className="size-3" />
                            </button>
                          </div>
                        </div>

                        {/* Barre d'outils unifiée [ B | I | U | S ] */}
                        <div className="flex h-10 flex-1 items-center justify-around rounded-xl border border-gray-200 bg-white p-1">
                          <button
                            type="button"
                            aria-label="Gras"
                            aria-pressed={style.text.bold}
                            onClick={() =>
                              setStyle((current) =>
                                current.text ? { ...current, text: { ...current.text, bold: !current.text.bold } } : current,
                              )
                            }
                            className={cn(
                              'flex size-8 items-center justify-center rounded-lg text-sm font-bold transition-all',
                              style.text.bold ? 'bg-ink text-white' : 'text-gray-600 hover:bg-gray-100',
                            )}
                          >
                            B
                          </button>
                          <button
                            type="button"
                            aria-label="Italique"
                            aria-pressed={style.text.italic}
                            onClick={() =>
                              setStyle((current) =>
                                current.text ? { ...current, text: { ...current.text, italic: !current.text.italic } } : current,
                              )
                            }
                            className={cn(
                              'flex size-8 items-center justify-center rounded-lg text-sm italic font-serif transition-all',
                              style.text.italic ? 'bg-ink text-white' : 'text-gray-600 hover:bg-gray-100',
                            )}
                          >
                            I
                          </button>
                          <button
                            type="button"
                            aria-label="Souligné"
                            aria-pressed={style.text.underline}
                            onClick={() =>
                              setStyle((current) =>
                                current.text ? { ...current, text: { ...current.text, underline: !current.text.underline } } : current,
                              )
                            }
                            className={cn(
                              'flex size-8 items-center justify-center rounded-lg text-sm underline font-medium transition-all',
                              style.text.underline ? 'bg-ink text-white' : 'text-gray-600 hover:bg-gray-100',
                            )}
                          >
                            U
                          </button>
                          <button
                            type="button"
                            aria-label="Barré"
                            aria-pressed={style.text.strikethrough}
                            onClick={() =>
                              setStyle((current) =>
                                current.text ? { ...current, text: { ...current.text, strikethrough: !current.text.strikethrough } } : current,
                              )
                            }
                            className={cn(
                              'flex size-8 items-center justify-center rounded-lg text-sm line-through font-medium transition-all',
                              style.text.strikethrough ? 'bg-ink text-white' : 'text-gray-600 hover:bg-gray-100',
                            )}
                          >
                            S
                          </button>
                        </div>
                      </div>

                      {/*
                        Alignement.

                        Le modèle porte `align`, la scène l'applique
                        (`textAlign`), l'export le relit — et aucun bouton ne
                        l'exposait. Le réglage existait donc partout sauf là où
                        le participant pouvait l'atteindre : une fonctionnalité
                        écrite, testée, exportée, et impossible à utiliser.

                        Les trois positions sont exclusives, donc `aria-pressed`
                        plutôt qu'un `role="radio"` : ce sont des boutons
                        indépendants dans une barre d'outils, pas un groupe de
                        radios, et le comportement par defaut du clavier reste le
                        bon.
                      */}
                      <div className="flex h-10 items-center justify-around rounded-xl border border-gray-200 bg-white p-1">
                        {(
                          [
                            ['left', AlignLeft, 'Aligner à gauche'],
                            ['center', AlignCenter, 'Centrer'],
                            ['right', AlignRight, 'Aligner à droite'],
                          ] as const
                        ).map(([valeur, Icone, libelle]) => (
                          <button
                            key={valeur}
                            type="button"
                            aria-label={libelle}
                            aria-pressed={(style.text?.align ?? 'left') === valeur}
                            onClick={() =>
                              setStyle((current) =>
                                current.text
                                  ? { ...current, text: { ...current.text, align: valeur } }
                                  : current,
                              )
                            }
                            className={cn(
                              'flex size-8 items-center justify-center rounded-lg transition-all',
                              (style.text?.align ?? 'left') === valeur
                                ? 'bg-ink text-white'
                                : 'text-gray-600 hover:bg-gray-100',
                            )}
                          >
                            <Icone className="size-4" aria-hidden />
                          </button>
                        ))}
                      </div>

                      {/* 4. Ligne 3 : Palette de couleurs carrousel */}
                      <div className="flex flex-col gap-1.5 pt-1">
                        <div className="flex items-center gap-2">
                          {/* Pipette / Sélecteur de couleur */}
                          <label className="relative flex size-8 cursor-pointer items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-xs hover:border-gray-400 active:scale-95">
                            <Pipette className="size-4 text-gray-700" />
                            <input
                              type="color"
                              value={style.text.color}
                              onChange={(e) =>
                                setStyle((current) =>
                                  current.text ? { ...current, text: { ...current.text, color: e.target.value } } : current,
                                )
                              }
                              className="absolute inset-0 cursor-pointer opacity-0"
                              aria-label="Pipette couleur"
                            />
                          </label>

                          {/* Pastilles de couleur de la page active */}
                          <div className="flex flex-1 items-center justify-between gap-1.5">
                            {TWIBBON_COLOR_PAGES[colorPage].map((color) => {
                              const isSelected = style.text?.color?.toLowerCase() === color.toLowerCase();
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  aria-label={`Couleur ${color}`}
                                  onClick={() =>
                                    setStyle((current) =>
                                      current.text ? { ...current, text: { ...current.text, color } } : current,
                                    )
                                  }
                                  className={cn(
                                    'size-7 rounded-full border transition-all active:scale-90',
                                    isSelected
                                      ? 'ring-2 ring-ink ring-offset-2 scale-105 shadow-sm'
                                      : 'border-black/10 hover:scale-105',
                                  )}
                                  style={{ backgroundColor: color }}
                                />
                              );
                            })}
                          </div>
                        </div>

                        {/* Pagination carrousel de couleurs ● ○ ○ */}
                        <div className="flex items-center justify-center gap-1.5 pt-1">
                          {TWIBBON_COLOR_PAGES.map((_, idx) => (
                            <button
                              key={idx}
                              type="button"
                              aria-label={`Page de couleurs ${idx + 1}`}
                              onClick={() => setColorPage(idx)}
                              className={cn(
                                'h-1.5 rounded-full transition-all',
                                colorPage === idx ? 'bg-gray-800 w-3.5' : 'bg-gray-300 w-1.5 hover:bg-gray-400',
                              )}
                            />
                          ))}
                        </div>
                      </div>

                      {/* 5. Ligne 4 : Boutons Discard et Done */}
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setStyle((current) => ({ ...current, text: null }))}
                          className="flex-1 rounded-full border border-gray-200 bg-white py-2.5 text-center text-sm font-medium text-gray-700 shadow-xs transition-colors hover:bg-gray-50 active:scale-98"
                        >
                          Retirer
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            /*
                              « Valider » termine l'édition, il ne supprime
                              rien (spec §10). On referme donc le panneau et on
                              rend la main : faire défiler vers une ancre
                              `export-section` était un comportement d'une autre
                              époque de la page, où le téléchargement vivait
                              tout en bas. Il vit maintenant dans la barre
                              principale, immédiatement au-dessus.
                            */
                            setActivePanel(null);
                            setTextFocusKey(0);
                          }}
                          className="flex-1 rounded-full bg-[#00D09E] py-2.5 text-center text-sm font-bold text-white shadow-sm transition-transform hover:brightness-105 active:scale-98"
                        >
                          Valider
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setStyle((current) => ({
                            ...current,
                            text: defaultParticipantText(zone, ratio),
                          }))
                        }
                      >
                        <Type className="size-3.5" aria-hidden />
                        Ajouter un texte
                      </Button>
                    </div>
                  )}
                </div>
                )}

                {/* ---------------- Export vidéo ----------------
                    Le téléchargement de l'image est passé dans la barre
                    principale : c'est l'action principale, elle ne doit pas
                    attendre qu'on arrive en bas d'une page. Seule la vidéo reste
                    ici, parce qu'elle n'existe que sur un cadre animé.

                    Réservée aux campagnes **photo** : sur une campagne vidéo,
                    c'est le bouton principal qui produit le clip, et proposer
                    deux téléchargements de vidéo au même participant n'aurait
                    aucun sens. */}
                {!isVideoCampaign && (animated || exporting === 'video') && (
                <div id="export-section" className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-5">
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    {animated && (
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={() => void runExport('video')}
                        disabled={exporting !== null || blocked || accessUnknown}
                      >
                        {exporting === 'video' ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            {Math.round(progress * 100)} %
                          </>
                        ) : (
                          <>
                            <Video className="size-4" aria-hidden />
                            Télécharger la vidéo
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {exporting === 'video' && (
                    <div className="mt-3 h-1 w-full overflow-hidden rounded-pill bg-gray-100">
                      <div
                        className="h-full bg-brand-gradient transition-[width] duration-150"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                  )}

                  {animated && pass.active && (
                    <p className="mt-3 text-[12px] leading-relaxed text-gray-500">
                      Le pass 24 h concerne l’export PNG. La vidéo conserve le filigrane.
                    </p>
                  )}
                </div>
                )}

                  {/*
                    Le pass « Sans filigrane » — son **état**, ici, dans le flux,
                    juste sous les boutons d'export : pass actif avec son compte à
                    rebours, ou paiement en cours de vérification. Rien d'autre :
                    quand aucun pass n'existe, ce composant ne rend rien.

                    L'**offre**, elle, ne vit plus à cet endroit. Elle est portée
                    par la bulle flottante (`WatermarkPassButton`, montée à la
                    racine du parcours) : une carte insérée dans le flux se perdait
                    dès que le participant faisait défiler la page pour composer
                    son visuel, et elle prenait la place des boutons qu'il cherche.
                  */}
                  {sharing && showWatermark && !blocked && !isVideoCampaign && <WatermarkPassStatus pass={pass} />}

                  {/*
                    Incitation au compte Créateur, à la place du simple constat.

                    Le texte vit dans `WatermarkUpsell`, parce qu'il change selon
                    la **raison** du badge : le créateur d'une campagne Gratuit
                    peut réellement le retirer, celui dont le visuel est repris
                    depuis la galerie doit distribuer. Écrit ici, le même texte
                    promettrait la même chose dans les deux cas — et mentirait
                    dans l'un des deux.

                    Elle s'efface quand le participant détient un pass : le badge
                    est alors déjà retiré pour lui, l'invitation n'a plus d'objet
                    et contredirait le pass affiché juste au-dessus.
                  */}
                  {showWatermark && !pass.active && !isVideoCampaign && <WatermarkUpsell fromPublicOnly={fromPublicOnly} />}

                {/*
                  Étape de partage. Elle vient après l'enregistrement, jamais
                  avant, et ne conditionne rien : elle n'apparaît que lorsque la
                  campagne est encore ouverte. Inviter des proches vers une
                  campagne bloquée les enverrait dans un cul-de-sac — mieux vaut
                  ne rien proposer que proposer un lien mort.
                */}
                {sharing && !blocked && (
                  <SharePanel campaign={campaign} />
                )}
              </>
            ) : (
              <Card className="mt-4 p-5">
                <span className="text-[13px] font-semibold text-gray-700">Comment ça marche</span>
                <ol className="mt-3 flex flex-col gap-3 text-[13px] leading-relaxed text-gray-500">
                  <li className="flex gap-2">
                    <span className="font-semibold text-ink">1.</span>
                    {isVideoCampaign
                      ? 'Vous choisissez une vidéo de 30 secondes maximum.'
                      : 'Vous choisissez une photo.'}
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-ink">2.</span>
                    {frame.photo_anchor
                      ? 'Vous la placez dans la zone prévue par le cadre.'
                      : 'Vous la placez derrière le cadre.'}
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-ink">3.</span>
                    {isVideoCampaign
                      ? 'Vous ajoutez un texte si vous voulez, puis vous téléchargez la vidéo avec le cadre.'
                      : 'Vous ajoutez un filtre ou un texte si vous voulez, puis vous enregistrez.'}
                  </li>
                </ol>
                <p className="mt-4 border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-400">
                  {isVideoCampaign
                    ? 'Votre vidéo est composée dans votre navigateur. Elle n’est jamais envoyée à nos serveurs, et rien n’est conservé. Seul votre téléchargement est compté, afin que le créateur sache quand sa campagne est épuisée.'
                    : 'Votre photo et son détourage sont traités dans votre navigateur, sans envoi à nos serveurs. Une seule exception : le retrait du filigrane avec un pass, qui doit passer par un rendu serveur et transmet alors votre visuel. Seul votre téléchargement est compté, afin que le créateur sache quand sa campagne est épuisée.'}
                </p>
              </Card>
            )}

            {/*
              Écran de blocage — apparaît quand la réservation est refusée. Il
              remplace les boutons d'export, pas l'écran entier : le participant
              garde la vue de son visuel, et comprend que la limite est atteinte
              plutôt que de croire à une panne.

              DEUX écrans, pas un : la limite franchie n'est pas la même selon
              la porte d'entrée. Sur `/d/[token]`, c'est le LIEN qui est épuisé
              — la campagne, elle, peut encore être largement ouverte. Afficher
              « {campaign.name} a été utilisée N fois » serait donc faux, et
              révélerait au passage la consommation d'un lien privé, qui est une
              donnée d'affaires entre le créateur et son client.
            */}
            {blocked && distributionToken && (
              <div
                role="status"
                className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-5"
              >
                <span className="text-[13px] font-semibold text-ink">
                  Ce lien est indisponible
                </span>
                <p className="text-[13px] leading-relaxed text-gray-600">
                  {privateLinkBlockedMessage()}
                </p>
                <p className="text-xs leading-relaxed text-gray-400">
                  Vous pouvez continuer à composer votre visuel : seul le téléchargement est
                  momentanément indisponible.
                </p>
              </div>
            )}

            {confirmedFile && distributionToken && (
              <Button variant="secondary" className="mt-4" onClick={() => downloadBlob(confirmedFile.blob, confirmedFile.filename)}>
                <Download className="size-4" aria-hidden /> Télécharger à nouveau le fichier confirmé
              </Button>
            )}

            {blocked && !distributionToken && (
              <div
                role="status"
                className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-5"
              >
                <span className="text-[13px] font-semibold text-ink">
                  Cette campagne a atteint sa limite
                </span>
                <p className="text-[13px] leading-relaxed text-gray-600">
                  {campaign.name} a été utilisée{' '}
                  {new Intl.NumberFormat('fr-FR').format(quota?.used ?? 0)} fois. Vous pouvez repartir
                  avec une version filigranée, sans compte, ou demander au créateur de prolonger la
                  campagne.
                </p>
                <p className="text-xs leading-relaxed text-gray-400">
                  {isVideoCampaign
                    ? 'La limite porte sur le nombre de téléchargements de la campagne. Le filigrane est toujours présent sur la vidéo.'
                    : 'La limite porte sur le nombre de téléchargements de la campagne. Le pass « Sans filigrane » retire le filigrane ; il ne rouvre pas une campagne épuisée.'}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void runWatermarkedExport(isVideoCampaign ? 'video' : 'png')}
                  disabled={!composed || exporting !== null}
                >
                  {exporting !== null ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Préparation…
                    </>
                  ) : (
                    <>
                      <Download className="size-4" aria-hidden />
                      {isVideoCampaign
                        ? 'Continuer et télécharger la vidéo'
                        : 'Continuer avec le filigrane'}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/*
              Compteur restant — campagne publique seulement. Sur un lien privé,
              le reliquat affiché serait celui du lien, et « gratuit » serait
              faux : le client a acheté une diffusion, il ne consomme pas une
              enveloppe offerte.
            */}
            {!blocked && !distributionToken && left !== null && left <= 3 && (
              <p className="mt-5 text-center text-xs text-gray-400">
                Il reste {left} téléchargement{left > 1 ? 's' : ''} gratuit{left > 1 ? 's' : ''}{' '}
                sur cette campagne.
              </p>
            )}

            <InlineError>{error}</InlineError>
          </div>

          {/* ---------------- Rebond produit ---------------- */}
          <div className="mt-10 border-t border-gray-200 pt-6">
            <div className="flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
              <div>
                <p className="text-[15px] font-semibold">Vous organisez votre propre campagne ?</p>
                <p className="mt-1 text-[13px] text-gray-500">
                  Créez votre cadre et partagez un lien comme celui-ci. C’est gratuit.
                </p>
              </div>
              <ButtonLink href="/signup" variant="secondary" size="sm">
                Créer ma campagne
              </ButtonLink>
            </div>
          </div>
        </div>
      </main>

      {/*
        La bulle d'achat du pass. Montée **à la racine**, hors du flux : elle
        reste ancrée en bas de l'écran pendant tout le défilement, au lieu de
        disparaître dès que le participant descend composer son visuel. Le
        décalage `pb-40 md:pb-48` du `main` ci-dessus lui laisse la place, pour
        qu'elle ne recouvre jamais le dernier bloc de la page.
      */}
      {showPassPromo && <WatermarkPassButton pass={pass} />}
    </div>
  );
}
