import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, ImagePlus, Loader2, Minus, Plus, RotateCcw, ShieldCheck, Video } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InlineError, Spinner } from '@/components/ui/feedback';
import { ParticipantStage } from '@/components/participant/participant-stage';
import { Toolbar } from '@/components/participant/toolbar';
import { FilterTools } from '@/components/participant/filter-tools';
import { backend } from '@/lib/backend';
import { frameZone, photoZone } from '@/lib/descriptor';
import { ratioSpec } from '@/lib/ratios';
import type { PlanId } from '@/lib/plans';
import { dataUrlToBlob, downloadBlob, exportFilename, exportPng, exportVideo } from '@/lib/video-export';
import { MAX_ZOOM, MIN_ZOOM, composeDescriptor, initialPlacement, movableAxes, readPhotoFile, zoomAroundCenter, type ParticipantPhoto, type PhotoPlacement } from '@/lib/participant';
import { blockedMessage, remaining } from '@/lib/quota';
import type { CampaignQuota, GalleryItem } from '@/lib/types';

/**
 * Page participant – `/d/[token]` (lien privé).
 * Fonctionne de façon identique à la page publique mais charge la campagne via le token.
 */
export default function PrivateParticipantPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [campaign, setCampaign] = useState<GalleryItem | null>(null);
  const [loading, setLoading] = useState(true);

  const [photo, setPhoto] = useState<ParticipantPhoto | null>(null);
  const [placement, setPlacement] = useState<PhotoPlacement | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [exporting, setExporting] = useState<'png' | 'video' | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<CampaignQuota | null>(null);

  const [filter, setFilter] = useState<string>('none'); // placeholder state

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------------- Chargement de la campagne (privée) ---------------- */
  useEffect(() => {
    if (!token) return;
    let alive = true;
    void backend.getPrivateCampaign(token).then((found) => {
      if (!alive) return;
      setCampaign(found);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  /* ---------------- Quota ---------------- */
  useEffect(() => {
    if (!campaign) return;
    let alive = true;
    void backend.getCampaignQuota(campaign.id).then((found) => {
      if (alive) setQuota(found);
    });
    return () => {
      alive = false;
    };
  }, [campaign]);

  const frame = campaign?.frame?.descriptor_json ?? null;
  const ratio = frame?.ratio ?? campaign?.ratio ?? '1:1';
  const spec = useMemo(() => ratioSpec(ratio), [ratio]);
  const zone = useMemo(() => (frame ? photoZone(frame) : frameZone(ratio)), [frame, ratio]);
  const creatorWatermark = campaign?.creator?.watermark ?? true;
  const exportPlan: PlanId = creatorWatermark ? 'free' : 'creator';

  const composed = useMemo(() => (frame ? composeDescriptor(frame, photo, placement) : null), [frame, photo, placement]);
  const animated = Boolean(frame?.motion);
  const blocked = quota !== null && !quota.open;
  const left = quota ? remaining(quota.used, quota.quota) : null;

  const choosePhoto = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const next = await readPhotoFile(file);
      setPhoto(next);
      setPlacement(initialPlacement(next, zone));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cette image n'a pas pu être ouverte.");
    } finally {
      setReading(false);
    }
  }, [zone]);

  const runExport = useCallback(async (kind: 'png' | 'video') => {
    if (!composed || !campaign) return;
    setError(null);
    setExporting(kind);
    setProgress(0);
    try {
      const claim = await backend.claimParticipation(campaign.id);
      if (claim.error) throw new Error(claim.error);
      const result = claim.data;
      if (!result) throw new Error("La réservation n'a pas abouti. Réessayez dans un instant.");
      setQuota({ used: result.used, quota: result.quota, open: result.granted });
      if (!result.granted) throw new Error(blockedMessage(campaign.name));
      if (kind === 'png') {
        const dataUrl = await exportPng({ descriptor: composed, plan: exportPlan });
        downloadBlob(dataUrlToBlob(dataUrl), exportFilename(campaign.name, 'png'));
      } else {
        const result = await exportVideo({ descriptor: composed, plan: exportPlan, onProgress: (p) => setProgress(p.ratio) });
        downloadBlob(result.blob, exportFilename(campaign.name, result.extension));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    } finally {
      setExporting(null);
      setProgress(0);
    }
  }, [campaign, composed, exportPlan]);

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
        <Link href="/" className="flex items-center gap-1.5 text-[13px] text-gray-500 transition-colors hover:text-ink">
          <ArrowLeft className="size-3.5" aria-hidden />
          Retour à l’accueil
        </Link>
      </div>
    );
  }

  const creatorLabel = campaign.creator ? campaign.creator.org_name || `@${campaign.creator.username}` : null;
  const axes = photo && placement ? movableAxes(photo, zone, placement.zoom) : null;

  return (
    <div className="min-h-dvh bg-white">
      {/* En‑tête minimal */}
      <header className="border-b border-gray-200">
        <div className="container-shell flex h-16 items-center justify-between gap-4">
          <Logo size="sm" />
          {creatorLabel && (
            <span className="truncate text-[13px] text-gray-500">Créé par <span className="font-medium text-ink">{creatorLabel}</span></span>
          )}
        </div>
      </header>
      {/* Toolbar */}
      <Toolbar />
      {/* Outils de filtre (placeholder) */}
      <FilterTools filter={filter} setFilter={setFilter} />
      <main className="container-shell py-10 md:py-14">
        <div className="mx-auto max-w-3xl">
          {/* Titre */}
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-gray-200 px-3 py-1 text-[11px] font-medium text-gray-500">
              <ShieldCheck className="size-3.5" aria-hidden />
              Votre photo reste sur votre appareil
            </span>
            <h1 className="mt-4 text-[28px] font-bold leading-tight md:text-[38px]">{campaign.name}</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-gray-500">Choisissez une photo, placez‑la comme vous voulez, puis enregistrez votre visuel. Aucun compte, aucune application.</p>
          </div>
          <div className="mt-10">
            {/* Scène */}
            <div className="min-w-0">
              {photo && placement ? (
                <ParticipantStage descriptor={frame} photo={photo} placement={placement} watermark={creatorWatermark} onPlacementChange={setPlacement} />
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); void choosePhoto(e.dataTransfer.files?.[0]); }}
                  className={
                    'relative flex min-h-[320px] flex-col items-center justify-center gap-5 overflow-hidden rounded-lg border-2 border-dashed p-8 text-center transition-colors ' +
                    (dragging ? 'border-purple bg-purple/5' : 'border-gray-200 bg-gray-50')
                  }
                >
                  {campaign.frame?.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={campaign.frame.thumbnail_url} alt={`Aperçu du cadre ${campaign.name}`} className="max-h-56 max-w-full rounded-md object-contain shadow-sm" />
                  ) : (
                    <span aria-hidden className="rounded-md border-2 border-gray-300 bg-white" style={{ width: ratio === '16:9' ? 200 : ratio === '9:16' ? 112 : 150, height: ratio === '16:9' ? 112 : ratio === '9:16' ? 200 : 150 }} />
                  )}
                  <div>
                    <p className="text-sm font-medium">Déposez votre photo ici</p>
                    <p className="mt-1 text-[13px] text-gray-500">ou choisissez‑la depuis votre appareil</p>
                  </div>
                  <Button variant="primary" size="lg" onClick={() => fileInputRef.current?.click()} disabled={reading}>
                    {reading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden /> Ouverture…
                      </>
                    ) : (
                      <>
                        <ImagePlus className="size-4" aria-hidden /> Choisir ma photo
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-gray-400">Format {spec.label.toLowerCase()} · JPG, PNG ou WebP</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void choosePhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            {photo && placement && (
              <>
                {/* Réglages */}
                <div className="mt-5">
                  <div className="flex items-center gap-3">
                    <button type="button" aria-label="Réduire" disabled={placement.zoom <= MIN_ZOOM + 1e-9} onClick={() => setPlacement((c) => c ? zoomAroundCenter(photo, zone, c, c.zoom - 0.2) : c)} className="flex size-9 shrink-0 items-center justify-center rounded-pill border border-gray-200 text-gray-700 transition-colors hover:border-ink disabled:opacity-35 disabled:hover:border-gray-200">
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={placement.zoom} onChange={(e) => setPlacement((c) => c ? zoomAroundCenter(photo, zone, c, Number(e.target.value)) : c)} className="min-w-0 flex-1 accent-purple" aria-label="Zoom de la photo" />
                    <button type="button" aria-label="Agrandir" disabled={placement.zoom >= MAX_ZOOM - 1e-9} onClick={() => setPlacement((c) => c ? zoomAroundCenter(photo, zone, c, c.zoom + 0.2) : c)} className="flex size-9 shrink-0 items-center justify-center rounded-pill border border-gray-200 text-gray-700 transition-colors hover:border-ink disabled:opacity-35 disabled:hover:border-gray-200">
                      <Plus className="size-4" aria-hidden />
                    </button>
                    <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-gray-500">{placement.zoom.toFixed(1)}×</span>
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPlacement(initialPlacement(photo, zone))}>
                      <RotateCcw className="size-3.5" aria-hidden /> Recentrer
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={reading}>
                      <ImagePlus className="size-3.5" aria-hidden /> Changer de photo
                    </Button>
                  </div>
                  <p className="mt-3 text-center text-[13px] text-gray-500">{axes && axes.x && axes.y ? 'Faites glisser la photo pour la positionner.' : 'Zoomez pour pouvoir déplacer la photo.'}</p>
                </div>
                {/* Export */}
                <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
                  <span className="text-[13px] font-semibold text-gray-700">Enregistrer mon visuel</span>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button variant="primary" size="md" onClick={() => void runExport('png')} disabled={exporting !== null || blocked || quota === null}>
                      {exporting === 'png' ? (<><Loader2 className="size-4 animate-spin" aria-hidden /> Préparation…</>) : (<><Download className="size-4" aria-hidden /> Télécharger l’image</>) }
                    </Button>
                    {animated && (
                      <Button variant="ghost" size="md" onClick={() => void runExport('video')} disabled={exporting !== null || blocked || quota === null}>
                        {exporting === 'video' ? (<><Loader2 className="size-4 animate-spin" aria-hidden />{Math.round(progress * 100)} %</>) : (<><Video className="size-4" aria-hidden /> Télécharger la vidéo</>) }
                      </Button>
                    )}
                  </div>
                  {exporting === 'video' && (
                    <div className="mt-3 h-1 w-full overflow-hidden rounded-pill bg-gray-100">
                      <div className="h-full bg-brand-gradient transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                  )}
                  {creatorWatermark && (
                    <p className="mt-4 text-xs leading-relaxed text-gray-400">Ce visuel porte le badge « Créé avec Campagnes ». Son créateur peut le retirer en passant à une formule payante.</p>
                  )}
                </div>
              </>
            )}
            {/* Blocage quota */}
            {blocked && (
              <div role="status" className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-5">
                <span className="text-[13px] font-semibold text-ink">Cette campagne a atteint sa limite</span>
                <p className="text-[13px] leading-relaxed text-gray-600">{campaign.name} a été utilisée {new Intl.NumberFormat('fr-FR').format(quota.used)} fois. Son creator peut la prolonger — son visuel n’est pas perdu, revenez plus tard.</p>
                <p className="text-xs leading-relaxed text-gray-400">Vous pouvez continuer à composer votre visuel : seul le téléchargement est momentanément indisponible.</p>
              </div>
            )}
            {/* Compteur restant */}
            {!blocked && left !== null && left <= 3 && (
              <p className="mt-5 text-center text-xs text-gray-400">Il reste {left} téléchargement{left > 1 ? 's' : ''} gratuit{left > 1 ? 's' : ''} sur cette campagne.</p>
            )}
            <InlineError>{error}</InlineError>
          </div>
          {/* Rebond produit */}
          <div className="mt-14 border-t border-gray-200 pt-8">
            <div className="flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
              <div>
                <p className="text-[15px] font-semibold">Vous organisez votre propre campagne ?</p>
                <p className="mt-1 text-[13px] text-gray-500">Créez votre cadre et partagez un lien comme celui‑ci. C’est gratuit.</p>
              </div>
              <ButtonLink href="/signup" variant="secondary" size="sm">Créer ma campagne</ButtonLink>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
