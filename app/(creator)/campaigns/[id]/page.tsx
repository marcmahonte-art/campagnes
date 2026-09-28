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
import { RatioPicker } from '@/components/ui/ratio-picker';
import { StatusBadge } from '@/components/ui/badge';
import { InlineError, Spinner } from '@/components/ui/feedback';
import { FrameEditor } from '@/components/frame/frame-editor';
import { DescriptorViewer } from '@/components/campaign/descriptor-viewer';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { createDescriptor, parseDescriptor, withRatio } from '@/lib/descriptor';
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
  const [descriptor, setDescriptor] = useState<Descriptor>(() => createDescriptor('1:1'));
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      let desc = createDescriptor(loaded.ratio);

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
      setDescriptor(desc);
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

  function changeRatio(ratio: Ratio) {
    setDescriptor((prev) => withRatio(prev, ratio));
  }

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
    } catch {
      setCopied(false);
    }
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

      {/* ---------------- Format ---------------- */}
      <section className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-[15px] font-semibold">Format</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Le cadre est automatiquement redimensionné dans le nouveau repère.
          </p>
        </div>
        <RatioPicker value={descriptor.ratio} onChange={changeRatio} />
      </section>

      {/* ---------------- Frame Engine ---------------- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Cadre</h2>
          <span className="text-[13px] text-gray-500">Je dépose → je positionne → c’est prêt.</span>
        </div>

        <FrameEditor
          descriptor={descriptor}
          onChange={setDescriptor}
          onReady={(api) => {
            thumbnailFn.current = api.exportThumbnail;
          }}
        />
      </section>

      {/* ---------------- Descripteur ---------------- */}
      <DescriptorViewer descriptor={descriptor} />

      {/* ---------------- Lien public ---------------- */}
      <section className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-[15px] font-semibold">Lien de la campagne</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            {campaign.status === 'published'
              ? 'Ce lien est actif : votre communauté peut l’ouvrir.'
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
