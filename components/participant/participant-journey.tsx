'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BadgeCheck,
  Download,
  ImagePlus,
  Loader2,
  Minus,
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
import { backend } from '@/lib/backend';
import { distributionService } from '@/lib/distribution-service';
import { PrivateExportCoordinator, PrivateExportUnavailable, technicalHash, type PreparedPrivateExport } from '@/lib/distribution-export';
import { frameZone, photoZone } from '@/lib/descriptor';
import { ratioSpec } from '@/lib/ratios';
import type { PlanId } from '@/lib/plans';
import {
  dataUrlToBlob,
  downloadBlob,
  exportFilename,
  exportPng,
  exportVideo,
} from '@/lib/video-export';
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
  readPhotoFile,
  zoomAroundCenter,
  type ParticipantState,
  type ParticipantText,
  type PhotoPlacement,
} from '@/lib/participant';
import { useHistory } from '@/components/editor/use-history';
import { PHOTO_FILTER_PRESETS, type PhotoFilter } from '@/lib/photo-filters';
import { blockedMessage, privateLinkBlockedMessage, remaining } from '@/lib/quota';
import { exportPlanFor, shouldWatermark } from '@/lib/watermark-policy';
import { PARTICIPANT_PAYMENT } from '@/lib/pricing/config';
import { FONTS } from '@/lib/fonts';
import type { CampaignQuota, GalleryItem } from '@/lib/types';

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

  const notify = useToast();

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
        setPhoto(next, initialPlacement(next, zone), !replacing);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Cette image n'a pas pu être ouverte.");
      } finally {
        setReading(false);
      }
    },
    [zone, photo, setPhoto],
  );

  /* ---------------- Export ---------------- */
  const runExport = useCallback(
    async (kind: 'png' | 'video') => {
      if (!composed || !campaign || !photo || exportBusy.current || blocked || accessUnknown || (!sharing && !distributionToken)) return;
      exportBusy.current = true;
      setError(null);
      setExporting(kind);
      setProgress(0);
      try {
        if (kind === 'video' && (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function')) {
          throw new Error('Votre navigateur ne sait pas produire de vidéo. Essayez le PNG.');
        }
        if (distributionToken) {
          if (!exportCoordinator.current) {
            const key = `campagnes.export.v1.${await technicalHash(distributionToken)}`;
            exportCoordinator.current = new PrivateExportCoordinator(sessionStorage, key,
              (action, operation) => distributionService.exportOperation(action, distributionToken, operation));
          }
          const fingerprint = await technicalHash(JSON.stringify(composed));
          const file = await exportCoordinator.current.run(kind, fingerprint, async () => {
            if (kind === 'png') {
              const url = await exportPng({ descriptor: composed, plan: exportPlan });
              return { blob: dataUrlToBlob(url), filename: exportFilename(campaign.name, 'png') };
            }
            const video = await exportVideo({ descriptor: composed, plan: exportPlan, onProgress: (p) => setProgress(p.ratio) });
            return { blob: video.blob, filename: exportFilename(campaign.name, video.extension) };
          });
          setConfirmedFile(file);
          downloadBlob(file.blob, file.filename);
                    notify('Image enregistrée ✓');
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

        if (kind === 'png') {
          const dataUrl = await exportPng({ descriptor: composed, plan: exportPlan });
          downloadBlob(dataUrlToBlob(dataUrl), exportFilename(campaign.name, 'png'));
        } else {
          const result = await exportVideo({
            descriptor: composed,
            plan: exportPlan,
            onProgress: (p) => setProgress(p.ratio),
          });
          downloadBlob(result.blob, exportFilename(campaign.name, result.extension));
        }

                notify('Image enregistrée ✓');

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
    [campaign, composed, photo, distributionToken, exportPlan, blocked, accessUnknown, sharing, notify],
  );

  const runWatermarkedExport = useCallback(
    async (kind: 'png' | 'video') => {
      if (!composed || !campaign || distributionToken || !sharing || exportBusy.current) return;
      setError(null);
      setExporting(kind);
      setProgress(0);
      try {
        if (kind === 'png') {
          const dataUrl = await exportPng({ descriptor: composed, plan: 'free' });
          downloadBlob(dataUrlToBlob(dataUrl), exportFilename(campaign.name, 'png'));
        } else {
          const result = await exportVideo({
            descriptor: composed,
            plan: 'free',
            onProgress: (p) => setProgress(p.ratio),
          });
          downloadBlob(result.blob, exportFilename(campaign.name, result.extension));
        }
                notify('Image enregistrée ✓');
      } catch (e) {
        setError(e instanceof Error ? e.message : "L'enregistrement a échoué.");
      } finally {
        setExporting(null);
        setProgress(0);
      }
    },
    [campaign, composed, distributionToken, sharing, notify],
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

      <main className="container-shell py-4 md:py-8">
        <div className="mx-auto max-w-2xl">
          {/* ---------------- Titre ---------------- */}
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-gray-200 px-3 py-1 text-[11px] font-medium text-gray-500">
              <ShieldCheck className="size-3.5" aria-hidden />
              Votre photo reste sur votre appareil
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
              {photo && placement ? (
                <ParticipantStage
                  descriptor={frame}
                  photo={photo}
                  placement={placement}
                  style={style}
                  watermark={showWatermark || blocked}
                  textFocusKey={textFocusKey}
                  onPlacementChange={setPlacementFromCanvas}
                  onTextChange={setTextFromCanvas}
                />
              ) : (
                /* ---------------- Dépôt de la photo ---------------- */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    void choosePhoto(e.dataTransfer.files?.[0]);
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
                    <p className="text-sm font-medium">Déposez votre photo ici</p>
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
                        Ouverture…
                      </>
                    ) : (
                      <>
                        <ImagePlus className="size-4" aria-hidden />
                        Choisir ma photo
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-gray-400">
                    Format {spec.label.toLowerCase()} · JPG, PNG ou WebP
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void choosePhoto(e.target.files?.[0]);
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
                    <ImagePlus className="size-4" aria-hidden />
                    Changer de photo
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
                    onClick={() => void runExport('png')}
                    disabled={exporting !== null || blocked || accessUnknown}
                    className="col-span-2 min-h-[48px] sm:col-span-1 sm:min-h-[44px]"
                  >
                    {exporting === 'png' ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Préparation…
                      </>
                    ) : (
                      <>
                        <Download className="size-4" aria-hidden />
                        Télécharger
                      </>
                    )}
                  </Button>
                </div>

                {/* ---------------- Panneau « Ajuster » : position et filtres ----------------
                    Le zoom et le filtre sont des ajustements de la photo, pas des
                    actions : ils n'ont rien à faire sur la barre principale. */}
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
                            ? zoomAroundCenter(photo, zone, current, current.zoom - 0.2)
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
                            ? zoomAroundCenter(photo, zone, current, Number(e.target.value))
                            : current,
                        )
                      }
                      className="min-w-0 flex-1 accent-purple"
                      aria-label="Zoom de la photo"
                    />

                    <button
                      type="button"
                      aria-label="Agrandir"
                      disabled={placement.zoom >= MAX_ZOOM - 1e-9}
                      onClick={() =>
                        setPlacement((current) =>
                          current
                            ? zoomAroundCenter(photo, zone, current, current.zoom + 0.2)
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
                      onClick={() => setPlacement(initialPlacement(photo, zone))}
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
                      ? 'Faites glisser la photo pour la positionner.'
                      : 'Zoomez pour pouvoir déplacer la photo.'}
                  </p>

                {/* ---------------- Filtre ----------------
                    Six choix, une ligne, aucun réglage à comprendre. Le filtre
                    est porté par le descripteur, donc l'aperçu et le fichier
                    téléchargé montrent forcément la même image. */}
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
                    ici, parce qu'elle n'existe que sur un cadre animé. */}
                {(animated || exporting === 'video') && (
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
                </div>
                )}

                  {/*
                    Bannière du filigrane.

                    Elle dit la vérité, et rien de plus. Deux raisons distinctes
                    posent le badge : la formule du créateur, ou le fait que ce
                    visuel est obtenu sans lien de distribution. Le texte doit
                    donc éviter de promettre que « seul le créateur peut le
                    retirer » — c'est faux pour un cadre Pro accédé depuis la
                    galerie.

                    On ne propose aucun bouton d'achat : le participant n'a pas
                    de compte, et un bouton qui n'active rien serait un mensonge.
                    Le lien mène à la page des formules, qui explique elle-même
                    ce qu'elles changent.
                  */}
                  {showWatermark && (
                    <div className="mt-4 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3.5">
                      <BadgeCheck
                        className="mt-0.5 size-4 shrink-0 text-purple"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <div>
                        {/*
                          Une phrase par raison. `fromPublicOnly` : le badge est
                          posé **malgré** la formule du créateur — donc annoncer
                          « une formule payante le retire » serait faux, et le
                          lien vers les formules n'aurait rien à y faire. Il
                          n'apparaît que dans l'autre cas, où il dit vrai.
                        */}
                        {fromPublicOnly ? (
                          <p className="text-[13px] leading-relaxed text-gray-600">
                            Ce visuel porte le badge « Créé avec Campagnes » : il est obtenu
                            depuis la galerie, sans lien de distribution. Seule une campagne
                            distribuée par son créateur en est exemptée.
                          </p>
                        ) : (
                          <>
                            <p className="text-[13px] leading-relaxed text-gray-600">
                              Ce visuel porte le badge « Créé avec Campagnes ». Il est ajouté par
                              le créateur de la campagne : seul son compte peut le retirer.
                            </p>
                            <Link
                              href="/tarifs"
                              className="mt-1.5 inline-block text-[13px] font-medium text-ink underline underline-offset-2"
                            >
                              Voir ce que retire une formule payante
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  )}

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
                    Vous choisissez une photo.
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-ink">2.</span>
                    {frame.photo_anchor
                      ? 'Vous la placez dans la zone prévue par le cadre.'
                      : 'Vous la placez derrière le cadre.'}
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-ink">3.</span>
                    Vous ajoutez un filtre ou un texte si vous voulez, puis vous enregistrez.
                  </li>
                </ol>
                <p className="mt-4 border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-400">
                  Votre photo est traitée dans votre navigateur. Elle n’est jamais envoyée à nos
                  serveurs, et rien n’est conservé. Seul votre téléchargement est compté, afin que
                  le créateur sache quand sa campagne est épuisée.
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
                  Le retrait du filigrane participant est prévu à {PARTICIPANT_PAYMENT.label} par
                  Mobile Money, valable 24 h.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void runWatermarkedExport('png')}
                  disabled={!composed || exporting !== null}
                >
                  {exporting === 'png' ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Préparation…
                    </>
                  ) : (
                    <>
                      <Download className="size-4" aria-hidden />
                      Continuer avec le filigrane
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
    </div>
  );
}
