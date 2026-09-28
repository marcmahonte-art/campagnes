'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Copy,
  Coins,
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
import { MotionPanel } from '@/components/campaign/motion-panel';
import { DescriptorViewer } from '@/components/campaign/descriptor-viewer';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { createDescriptor, parseDescriptor, withRatio } from '@/lib/descriptor';
import { isValidSlug } from '@/lib/slug';
import { consumedRatio } from '@/lib/credits';
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
  const [budget, setBudget] = useState(0);
  const [budgetState, setBudgetState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [playing, setPlaying] = useState(false);

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
      setBudget(loaded.distribution_budget);
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

  /**
   * Le budget de distribution est enregistré explicitement, pas en autosave :
   * c'est un arbitrage financier, pas une retouche de mise en page.
   */
  async function saveBudget(next: number) {
    if (!campaign) return;
    const value = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));

    if (value < campaign.credits_consumed) {
      setError(
        `Ce budget est inférieur aux ${campaign.credits_consumed} participations déjà consommées.`,
      );
      return;
    }

    setError(null);
    setBudgetState('saving');
    const result = await backend.updateCampaign(campaign.id, { distribution_budget: value });
    if (result.error) {
      setError(result.error);
      setBudgetState('idle');
      return;
    }

    setBudget(value);
    setCampaign((prev) => (prev ? { ...prev, distribution_budget: value } : prev));
    setBudgetState('saved');
    setTimeout(() => setBudgetState((s) => (s === 'saved' ? 'idle' : s)), 2000);
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
          playing={playing}
          onReady={(api) => {
            thumbnailFn.current = api.exportThumbnail;
          }}
        />
      </section>

      {/* ---------------- Animation (Motion Engine) ---------------- */}
      <MotionPanel
        descriptor={descriptor}
        onChange={setDescriptor}
        playing={playing}
        onPlayingChange={setPlaying}
        plan={user?.plan ?? 'free'}
        campaignName={name}
      />

      {/* ---------------- Descripteur ---------------- */}
      <DescriptorViewer descriptor={descriptor} />

      {/* ---------------- Distribution ---------------- */}
      <section className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Coins className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
              Budget de distribution
            </h2>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-gray-500">
              Le nombre de participations que cette campagne est autorisée à servir. Un crédit n’est
              décompté que lorsqu’un participant repart avec son visuel.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[12px] text-gray-500">Solde du compte</p>
            <p className="text-[15px] font-semibold">
              {new Intl.NumberFormat('fr-FR').format(user?.credits ?? 0)}
            </p>
          </div>
        </div>

        {campaign.distribution_budget > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-gray-500">
                {campaign.credits_consumed} consommées sur {campaign.distribution_budget}
              </span>
              <span className="font-medium">
                {consumedRatio(campaign.credits_consumed, campaign.distribution_budget)} %
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-pill bg-gray-100">
              <div
                className="bg-brand-gradient h-full rounded-pill transition-[width] duration-300 ease-brand"
                style={{
                  width: `${consumedRatio(campaign.credits_consumed, campaign.distribution_budget)}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label="Participations autorisées">
              <Input
                type="number"
                min={campaign.credits_consumed}
                step={10}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            {[100, 500, 1000, 5000].map((value) => (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                onClick={() => void saveBudget(value)}
                disabled={budgetState === 'saving'}
              >
                {new Intl.NumberFormat('fr-FR').format(value)}
              </Button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void saveBudget(budget)}
            disabled={budgetState === 'saving'}
          >
            {budgetState === 'saving' ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Enregistrement…
              </>
            ) : budgetState === 'saved' ? (
              <>
                <Check className="size-3.5 text-success" aria-hidden />
                Enregistré
              </>
            ) : (
              'Définir ce budget'
            )}
          </Button>
        </div>

        {(user?.credits ?? 0) < campaign.distribution_budget && (
          <p className="flex items-start gap-2 rounded-md border border-error/25 bg-error/5 px-3 py-2 text-[13px] text-error">
            <Coins className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Votre solde ne couvre pas ce budget.{' '}
              <Link href="/credits" className="underline underline-offset-4">
                Recharger des crédits
              </Link>
              .
            </span>
          </p>
        )}

        {campaign.distribution_budget === 0 && (
          <p className="text-[12px] leading-relaxed text-gray-500">
            Sans budget défini, la campagne reste visible dans la galerie mais ne pourra pas servir
            de participation.
          </p>
        )}
      </section>

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
