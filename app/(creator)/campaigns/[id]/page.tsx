'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input, InputPrefix } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { InlineError, Spinner } from '@/components/ui/feedback';
import { FrameEditor } from '@/components/frame/frame-editor';
import { useHistory } from '@/components/editor/use-history';
import { DescriptorViewer } from '@/components/campaign/descriptor-viewer';
import { backend } from '@/lib/backend';
import { distributionService } from '@/lib/distribution-service';
import { useSession } from '@/lib/backend/session';
import { parseDescriptor } from '@/lib/descriptor';
import { kindSpec, seedDescriptorFor } from '@/lib/campaign-kinds';
import {
  DEFAULT_TIER,
  QUOTE_THRESHOLD,
  TOPUP_TIERS,
  formatFcfaTier,
  remaining,
  shouldInviteToTopup,
  topupHref,
} from '@/lib/quota';
import { maxLayers } from '@/lib/plans';
import { isValidSlug } from '@/lib/slug';
import { SITE_URL } from '@/lib/backend/config';
import type { CampaignWithFrame, Descriptor, Ratio } from '@/lib/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function CampaignEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const campaignId = params?.id;

  const [campaign, setCampaign] = useState<CampaignWithFrame | null>(null);
  const [frameId, setFrameId] = useState<string | null>(null);
  /**
   * Le descripteur vit dans un historique : « annuler » restaure un cadre, il ne
   * déplace pas des pixels à l'envers. La reconstruction du canvas suit, portée
   * par le seul descripteur.
   */
  const history = useHistory<Descriptor>(seedDescriptorFor('photo_frame', '1:1'));
  const descriptor = history.value;
  const setDescriptor = history.set;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [privateLink, setPrivateLink] = useState<string | null>(null);
  const [privateLinkLoading, setPrivateLinkLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Aperçu : masque les outils d'édition et joue l'animation du cadre. */
  const [preview, setPreview] = useState(false);

  /** Tant que le chargement initial n'est pas terminé, l'autosave est désactivé. */
  const initialized = useRef(false);
  const thumbnailFn = useRef<(() => string | null) | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------------- Chargement ---------------- */
  useEffect(() => {
    if (!campaignId || !user) return;
    let alive = true;

    void (async () => {
      const loaded = await backend.getCampaign(campaignId);
      if (!alive) return;

      if (!loaded || loaded.owner_id !== user.id) {
        setError('Cette campagne est introuvable.');
        setLoading(false);
        return;
      }

      let id = loaded.frame_id;
      // Le descripteur d'amorce est calé sur le type choisi à la création :
      // une campagne « photo sur fond » démarre avec sa zone photo, les deux
      // autres démarrent en cadre transparent plein.
      let desc = seedDescriptorFor(loaded.kind, loaded.ratio);

      if (id) {
        const frame = await backend.getFrame(id);
        if (frame) desc = parseDescriptor(frame.descriptor_json);
      } else {
        // Première ouverture : le cadre est créé avec le format choisi.
        const created = await backend.createFrame(user.id, `Cadre — ${loaded.name}`, desc);
        if (created.data) {
          id = created.data.id;
          await backend.updateCampaign(loaded.id, { frame_id: id });
        }
      }

      if (!alive) return;
      setCampaign({ ...loaded, frame_id: id });
      setFrameId(id);
      // `reset` et non `set` : le cadre chargé n'est pas une modification, il
      // n'a rien à annuler derrière lui.
      history.reset(desc);
      setName(loaded.name);
      setSlug(loaded.slug);
      setLoading(false);
      // Laisse le Frame Editor finir son premier rendu avant d'armer l'autosave.
      setTimeout(() => {
        initialized.current = true;
      }, 400);
    })();

    return () => {
      alive = false;
    };
  }, [campaignId, user]);

  /* ---------------- Autosave ---------------- */
  const persist = useCallback(
    async (payload: {
      descriptor: Descriptor;
      name: string;
      slug: string;
      ratio: Ratio;
    }) => {
      if (!frameId || !campaign) return;
      setSaveState('saving');
      try {
        const thumbnail = thumbnailFn.current?.() ?? null;
        const frameResult = await backend.saveFrame(frameId, payload.descriptor, thumbnail);
        if (frameResult.error) {
          setSaveState('error');
          setError(frameResult.error);
          return;
        }

        const patch: Parameters<typeof backend.updateCampaign>[1] = {
          ratio: payload.ratio,
        };
        if (payload.name !== campaign.name) patch.name = payload.name;
        if (payload.slug !== campaign.slug) {
          if (!isValidSlug(payload.slug)) {
            setSaveState('error');
            setError('Adresse invalide : 3 à 60 caractères, lettres minuscules, chiffres et tirets.');
            return;
          }
          patch.slug = payload.slug;
        }

        const campaignResult = await backend.updateCampaign(campaign.id, patch);
        if (campaignResult.error) {
          setSaveState('error');
          setError(campaignResult.error);
          return;
        }

        setCampaign((prev) => (prev ? { ...prev, ...patch } : prev));
        setError(null);
        setSaveState('saved');
      } finally {
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000);
      }
    },
    [campaign, frameId],
  );

  useEffect(() => {
    if (!initialized.current || !campaign || !frameId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist({ descriptor, name, slug, ratio: descriptor.ratio });
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [descriptor, name, slug, persist, campaign, frameId]);

  /* ---------------- Actions ---------------- */
  const publicUrl = useMemo(() => `${SITE_URL}/c/${campaign?.slug ?? ''}`, [campaign?.slug]);

  /** Le lien public ne répond plus : le quota de participants est consommé. */
  const blocked = campaign
    ? campaign.participants_used >= campaign.participants_granted
    : false;
  const quota = campaign?.participants_granted ?? 0;

  async function togglePublish() {
    if (!campaign) return;
    const next = campaign.status === 'published' ? 'draft' : 'published';

    if (next === 'published' && descriptor.layers.length === 0) {
      setError('Ajoutez au moins un élément au cadre avant de publier.');
      return;
    }

    setSaveState('saving');
    // On force l'enregistrement du cadre avant de changer le statut.
    if (frameId) {
      await backend.saveFrame(frameId, descriptor, thumbnailFn.current?.() ?? null);
    }
    const result = await backend.updateCampaign(campaign.id, { status: next, ratio: descriptor.ratio });
    if (result.error) {
      setError(result.error);
      setSaveState('error');
      return;
    }
    setCampaign((prev) => (prev ? { ...prev, status: next } : prev));
    setError(null);
    setSaveState('saved');
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  // Generate a private distribution link
  async function generatePrivateLink() {
    if (!campaign) return;
    setPrivateLinkLoading(true);
    const result = await distributionService.createDistributionLink(
      campaign.id,
      campaign.participants_granted,
    );
    if (result.error) {
      setError(result.error);
    } else {
      setPrivateLink(result.data);
    }
    setPrivateLinkLoading(false);
  }



  async function removeCampaign() {
    if (!campaign) return;
    const result = await backend.deleteCampaign(campaign.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push('/dashboard');
  }

  /* ---------------- Rendu ---------------- */
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-5 text-gray-400" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-sm text-gray-500">{error ?? 'Campagne introuvable.'}</p>
        <ButtonLink href="/dashboard" variant="ghost" className="mt-6">
          Retour au dashboard
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {/* ---------------- En-tête ---------------- */}
      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard"
          className="flex w-fit items-center gap-1.5 text-[13px] text-gray-500 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Mes campagnes
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-[24px] font-bold leading-tight md:text-[28px]">{name}</h1>
            <StatusBadge status={campaign.status} />
          </div>

          <div className="flex items-center gap-2">
            <SaveIndicator state={saveState} />
            <Button
              variant={campaign.status === 'published' ? 'ghost' : 'primary'}
              onClick={() => void togglePublish()}
            >
              {campaign.status === 'published' ? (
                'Repasser en brouillon'
              ) : (
                <>
                  <UploadCloud className="size-4" strokeWidth={1.75} aria-hidden />
                  Publier
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <InlineError>{error}</InlineError>

      {/* ---------------- Identité ---------------- */}
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Nom de la campagne">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Adresse publique" hint="Le lien que vous partagerez.">
          <InputPrefix prefix="campagnes.app/c/">
            <Input
              aria-label="Adresse publique"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-'))
              }
            />
          </InputPrefix>
        </Field>
      </div>

      {/* ---------------- Éditeur ---------------- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">
            Cadre — {kindSpec(campaign.kind).label}
          </h2>
          <span className="text-[13px] text-gray-500">Je dépose → je positionne → c’est prêt.</span>
        </div>

        {/* Rappel du mode choisi à la création : en « photo sur fond », il faut
            désigner un calque comme zone photo, sinon la photo du participant
            couvrira tout le cadre malgré le type de campagne. */}
        {campaign.kind === 'background_frame' && !descriptor.photo_anchor && (
          <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] leading-relaxed text-gray-600">
            Sélectionnez un élément du cadre puis cliquez sur{' '}
            <span className="font-medium text-ink">Définir comme zone</span> pour qu’il y ait une
            fenêtre à remplir.
          </p>
        )}

        <FrameEditor
          descriptor={descriptor}
          onChange={setDescriptor}
          kind={campaign.kind}
          preview={preview}
          onPreviewChange={setPreview}
          playing={preview && !!descriptor.motion}
          maxLayers={maxLayers(user?.plan)}
          plan={user?.plan ?? 'free'}
          campaignName={name}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
          onReady={(api) => {
            thumbnailFn.current = api.exportThumbnail;
          }}
        />
      </section>

      {/* ---------------- Descripteur ---------------- */}
      <DescriptorViewer descriptor={descriptor} />

      {/* ---------------- Quota de participants ---------------- */}
      <section className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Participants</h2>
          {campaign.participants_used > 0 && (
            <span className="text-[13px] text-gray-500">
              {campaign.participants_used} téléchargement
              {campaign.participants_used > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <QuotaMeter used={campaign.participants_used} quota={campaign.participants_granted} />

        {blocked || shouldInviteToTopup(campaign.participants_used, campaign.participants_granted) ? (
          <div className="flex flex-col gap-4 rounded-md border border-gray-200 bg-gray-50 p-4">
            <p className="text-[13px] leading-relaxed text-gray-600">
              {blocked ? (
                <>
                  <span className="font-semibold text-ink">Votre lien est bloqué.</span> Les{' '}
                  {quota} téléchargements offerts ont été consommés : plus personne ne peut
                  télécharger votre visuel. Prolongez-le pour le rouvrir.
                </>
              ) : (
                <>
                  Il vous reste{' '}
                  {remaining(campaign.participants_used, campaign.participants_granted)}{' '}
                  téléchargement
                  {remaining(campaign.participants_used, campaign.participants_granted) > 1
                    ? 's'
                    : ''}{' '}
                  offert
                  {remaining(campaign.participants_used, campaign.participants_granted) > 1
                    ? 's'
                    : ''}
                  . Ensuite votre lien se bloquera.
                </>
              )}
            </p>

            {/*
              Les paliers reprennent la grille de `/tarifs` : mêmes volumes,
              mêmes prix. Un créateur qui a lu               l'une reconnaît l'autre — il n'y a pas deux grilles concurrentes.
            */}
            <div className="grid gap-2 sm:grid-cols-2">
              {TOPUP_TIERS.map((tier) => (
                <a
                  key={tier.downloads}
                  href={topupHref({
                    campaignName: campaign.name,
                    campaignSlug: campaign.slug,
                    used: campaign.participants_used,
                    quota: campaign.participants_granted,
                    tier,
                  })}
                  className={
                    tier === DEFAULT_TIER
                      ? 'flex items-center justify-between gap-3 rounded-md border border-transparent bg-ink px-3 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90'
                      : 'flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-[13px] transition-colors hover:border-ink'
                  }
                >
                  <span className="font-medium">
                    +{new Intl.NumberFormat('fr-FR').format(tier.downloads)}
                  </span>
                  <span className={tier === DEFAULT_TIER ? 'text-white/80' : 'text-gray-500'}>
                    {formatFcfaTier(tier.priceFcfa)}
                  </span>
                </a>
              ))}
            </div>

            <p className="text-[12px] leading-relaxed text-gray-500">
              L’extension s’obtient par demande de devis — aucun paiement en ligne pour l’instant.
              Au-delà de {new Intl.NumberFormat('fr-FR').format(QUOTE_THRESHOLD)} téléchargements,
              c’est traité directement au devis.
            </p>
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed text-gray-500">
            Chaque téléchargement de votre visuel est compté. À {campaign.participants_granted}, le
            lien se bloque et vous pourrez le prolonger sur devis.
          </p>
        )}
      </section>

      {/* ---------------- Lien public ---------------- */}
      <section className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-[15px] font-semibold">Lien de participation</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
            {campaign.status === 'published'
              ? 'Partagez ce lien : chacun y dépose sa photo, la place dans votre cadre et repart avec son visuel — sans compte.'
              : 'Le lien ne sera actif qu’après publication.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-[12px] text-gray-700">
            {publicUrl}
          </code>
          <Button variant="ghost" onClick={() => void copyLink()}>
            {copied ? (
              <>
                <Check className="size-4 text-success" aria-hidden /> Copié
              </>
            ) : (
              <>
                <Copy className="size-4" strokeWidth={1.75} aria-hidden /> Copier
              </>
            )}
          </Button>
          {campaign.status === 'published' && (
            <ButtonLink href={publicUrl} variant="secondary">
              <ExternalLink className="size-4" strokeWidth={1.75} aria-hidden />
              Ouvrir
            </ButtonLink>
          )}
          </div>
          {/* Private link generation */}
          <div className="mt-3 flex items-center gap-2">
            {!privateLink && (
              <Button variant="secondary" onClick={generatePrivateLink} disabled={privateLinkLoading}>
                {privateLinkLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Génération…
                  </>
                ) : (
                  <>Créer lien privé</>
                )}
              </Button>
            )}
            {privateLink && (
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-sm text-gray-700">
                  {`${SITE_URL}/d/${privateLink}`}
                </code>
                <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(`${SITE_URL}/d/${privateLink}`); }}>
                  <Copy className="size-4" aria-hidden /> Copier
                </Button>
              </div>
            )}
          </div>
      </section>

      {/* ---------------- Zone sensible ---------------- */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-[15px] font-semibold">Supprimer la campagne</h2>
        <p className="mt-1 text-[13px] text-gray-500">
          Le cadre associé est conservé, mais la campagne et son lien disparaissent.
        </p>

        <div className="mt-4">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="destructive" onClick={() => void removeCampaign()}>
                <Trash2 className="size-4" strokeWidth={1.75} aria-hidden />
                Confirmer la suppression
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
            </div>
          ) : (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" strokeWidth={1.75} aria-hidden />
              Supprimer
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Jauge du quota de participants.
 *
 * La barre ne change pas de forme selon l'avancement : seule la couleur porte
 * l'information, pour qu'un créateur qui regarde une campagne à 9/10 comprenne
 * en un coup d'œil ce qu'il lui reste à faire.
 */
function QuotaMeter({ used, quota }: { used: number; quota: number }) {
  const safeQuota = Math.max(1, quota);
  const ratio = Math.min(1, used / safeQuota);
  const left = remaining(used, quota);
  const pct = Math.round(ratio * 100);
  const badgeColor = left === 0 ? 'bg-red-500' : left <= 3 ? 'bg-orange-500' : 'bg-green-500';
  const badgeLabel = left === 0 ? 'Épuisé' : left <= 3 ? 'Proche' : 'Disponible';

  return (
    <div className="flex flex-col gap-2">
      {/* Badge indicating quota status */}
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${badgeColor}`}>
        {badgeLabel} {left} / {quota}
      </span>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-medium tabular-nums">
          {used} / {quota}
        </span>
        <span className="text-gray-500">
          {left > 0 ? `${left} restant${left > 1 ? 's' : ''}` : 'Quota atteint'}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-label="Téléchargements consommés"
        className="h-1.5 w-full overflow-hidden rounded-pill bg-gray-100"
      >
        <div
          className={
            left === 0
              ? 'h-full rounded-pill bg-error'
              : left <= 3
                ? 'h-full rounded-pill bg-yellow'
                : 'bg-brand-gradient h-full rounded-pill'
          }
          style={{ width: `${Math.max(pct, used > 0 ? 3 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;

  const content =
    state === 'saving' ? (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Enregistrement…
      </>
    ) : state === 'saved' ? (
      <>
        <Check className="size-3.5 text-success" aria-hidden />
        Enregistré
      </>
    ) : (
      <span className="text-error">Non enregistré</span>
    );

  return (
    <span className="flex items-center gap-1.5 text-[12px] text-gray-500" aria-live="polite">
      {content}
    </span>
  );
}
