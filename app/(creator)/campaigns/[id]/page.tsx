'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input, InputPrefix, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { InlineError, Spinner } from '@/components/ui/feedback';
import { FrameEditor } from '@/components/frame/frame-editor';
import { useHistory } from '@/components/editor/use-history';
import { DescriptorViewer } from '@/components/campaign/descriptor-viewer';
import { TopupButton } from '@/components/campaign/topup-button';
import { TopupReturnNotice } from '@/components/campaign/topup-return-notice';
import { backend } from '@/lib/backend';
import type { DistributionLink } from '@/lib/backend/types';
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
} from '@/lib/quota';
import { maxLayers } from '@/lib/plans';
import { isValidSlug } from '@/lib/slug';
import {
  BRAND_HASHTAG,
  MAX_CUSTOM_HASHTAGS,
  buildShareText,
  campaignHashtags,
  parseHashtagsInput,
  privateDistributionUrl,
  publicCampaignUrl,
} from '@/lib/share';
import type { CampaignWithFrame, Descriptor, Ratio } from '@/lib/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Format des nombres et des dates affichés pour les liens de distribution. */
const fmtCount = new Intl.NumberFormat('fr-FR');
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

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
  /**
   * Liens de distribution **déjà créés**, relus depuis la base.
   *
   * Ils ne vivent pas dans le composant : c'est précisément la différence entre
   * un lien qui existe et un jeton qu'on a vu passer. Un rechargement doit
   * rendre la même liste, puisque la base n'a rien perdu.
   */
  const [privateLinks, setPrivateLinks] = useState<DistributionLink[]>([]);
  const [privateLinksLoading, setPrivateLinksLoading] = useState(true);
  /** Échec de la lecture : on le montre plutôt que de laisser croire à « aucun lien ». */
  const [privateLinksError, setPrivateLinksError] = useState<string | null>(null);
  const [privateLinkLoading, setPrivateLinkLoading] = useState(false);
  /** Jeton fraîchement copié — « Copié » ne s'affiche que sur cette ligne-là. */
  const [privateCopiedToken, setPrivateCopiedToken] = useState<string | null>(null);
  /**
   * Quota du **prochain** lien de distribution, saisi par le créateur.
   *
   * Il est **indépendant** du quota de la campagne : il compte les
   * téléchargements d'une diffusion précise. La valeur initiale n'est qu'une
   * commodité de saisie — elle ne copie rien, elle propose.
   */
  const [privateQuota, setPrivateQuota] = useState('1000');
  const creationBusy = useRef(false);
  const creationRequest = useRef<{ quota: number; reference: string } | null>(null);
  const creditRequests = useRef(new Map<string, { amount: number; reference: string }>());
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [rechargeAmounts, setRechargeAmounts] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Aperçu : masque les outils d'édition et joue l'animation du cadre. */
  const [preview, setPreview] = useState(false);

  /**
   * Texte et hashtags de partage.
   *
   * Volontairement **hors de l'autosave** : ces colonnes n'existent qu'à partir
   * de la migration 0011. Les mêler à l'enregistrement du cadre ferait échouer
   * ce dernier sur une base qui ne les porte pas encore — on perdrait le travail
   * de composition pour une option annexe. Une sauvegarde explicite et isolée
   * garantit qu'un échec ici ne coûte jamais le cadre.
   */
  const [shareText, setShareText] = useState('');
  const [shareHashtags, setShareHashtags] = useState('');
  const [shareState, setShareState] = useState<SaveState>('idle');
  const [shareError, setShareError] = useState<string | null>(null);

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
      setShareText(loaded.share_text ?? '');
      setShareHashtags((loaded.share_hashtags ?? []).join(' '));
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

  /* ---------------- Liens de distribution ---------------- */
  /**
   * Recharge les liens depuis la base.
   *
   * C'est la lecture qui rend un lien **persistant** : l'écran ne retient rien
   * pour lui, il affiche ce que la base contient. Appelée à l'ouverture puis
   * après chaque création, elle garantit qu'un rechargement n'efface rien —
   * un lien créé reste affiché, avec son quota, ses usages et son statut.
   *
   * Elle n'écrit jamais : ouvrir la page de gestion ne crée pas de lien.
   */
  const refreshPrivateLinks = useCallback(async () => {
    if (!campaignId) return;
    setPrivateLinksLoading(true);
    const result = await distributionService.listDistributionLinks(campaignId);
    setPrivateLinksError(result.error ?? null);
    setPrivateLinks(result.data ?? []);
    setPrivateLinksLoading(false);
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId || !user) return;
    void refreshPrivateLinks();
  }, [campaignId, user, refreshPrivateLinks]);

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
  /*
   * Même fonction que celle utilisée par le participant : le créateur voit donc
   * exactement le lien qui sera partagé, pas une approximation construite
   * ailleurs à partir d'une autre source.
   */
  const publicUrl = useMemo(() => publicCampaignUrl(campaign?.slug ?? ''), [campaign?.slug]);

  /**
   * Aperçu du texte de partage, recalculé à la frappe.
   *
   * Le créateur voit exactement ce que le participant enverra — c'est la seule
   * façon de comprendre ce que font les hashtags automatiques, et d'écrire un
   * texte qui ne les répète pas.
   */
  const sharePreview = useMemo(
    () =>
      buildShareText(
        { name, share_text: shareText, share_hashtags: parseHashtagsInput(shareHashtags) },
        publicUrl,
      ),
    [name, shareText, shareHashtags, publicUrl],
  );

  /** Ce que `campaignHashtags` ajoutera tout seul, pour pouvoir le montrer. */
  const automaticTags = useMemo(
    () =>
      campaignHashtags({ name, share_hashtags: [] }).filter((tag) => tag !== BRAND_HASHTAG),
    [name],
  );

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

  /**
   * Enregistre le texte et les hashtags de partage.
   *
   * Écriture isolée, avec son propre indicateur d'état : l'échec de cette
   * sauvegarde ne doit jamais se confondre avec celui du cadre, et le créateur
   * doit savoir laquelle des deux a échoué.
   */
  async function saveShare() {
    if (!campaign) return;
    setShareState('saving');
    setShareError(null);

    const tags = parseHashtagsInput(shareHashtags);
    const trimmed = shareText.trim();
    const patch = {
      share_text: trimmed ? trimmed : null,
      share_hashtags: tags.length > 0 ? tags : null,
    };

    const result = await backend.updateCampaign(campaign.id, patch);
    if (result.error) {
      setShareState('error');
      setShareError(result.error);
      return;
    }

    setCampaign((prev) => (prev ? { ...prev, ...patch } : prev));
    setShareState('saved');
    setTimeout(() => setShareState((s) => (s === 'saved' ? 'idle' : s)), 2000);
  }

  /**
   * Traduit une erreur de création en phrase adressée à quelqu'un.
   *
   * Les messages en français viennent de la RPC elle-même (quota nul,
   * campagne introuvable) : ils sont déjà écrits pour le créateur, on les
   * tels quels. Tout le reste — `permission denied`, contrainte violée, nom de
   * colonne — est du jargon de base de données : personne ne peut rien en
   * faire à l'écran, et l'afficher donnerait l'impression d'un défaut
   * qu'il faudrait comprendre pour s'en sortir.
   */
  function distributionError(raw: string | undefined): string {
    const generic = 'Impossible de générer le lien. Veuillez réessayer.';
    if (!raw) return generic;
    const technical =
      /permission denied|violat|constraint|foreign key|duplicate|column|relation|syntax|does not exist|schema/i;
    return technical.test(raw) ? generic : raw;
  }

  /**
   * Crée un jeton de distribution.
   *
   * Le quota est **saisi**, pas recopié de la campagne. Le contrat du backend
   * est explicite là-dessus (`lib/backend/types.ts`) : le quota d'un lien privé
   * compte les téléchargements d'une diffusion précise — un client, un
   * événement — et n'a rien à voir avec le quota global de la campagne. Passer
   * `participants_granted` par défaut aurait été commode et faux : les deux
   * compteurs ne mesurent pas la même chose, et rien à l'écran n'aurait signalé
   * la confusion.
   *
   * Après création, on **relit la liste** plutôt que de conserver le jeton
   * renvoyé : l'écran affiche alors toujours la même chose qu'au
   * rechargement, et le fait que le lien apparaisse prouve au passage qu'il est
   * bien en base.
   */
  async function generatePrivateLink() {
    if (!campaign || creationBusy.current) return;
    if (campaign.status !== 'published' || !campaign.frame_id) { setError('Publiez votre campagne et enregistrez son cadre avant de distribuer un lien.'); return; }
    const quota = Number(privateQuota);
    if (!/^\d+$/.test(privateQuota) || !Number.isSafeInteger(quota) || quota <= 0 || quota > 1000000) {
      setError('Indiquez un entier entre 1 et 1 000 000 pour ce lien.');
      return;
    }

    const requestKey = `campagnes.distribution.create.${campaign.id}`;
    try {
      creationBusy.current = true;
      setPrivateLinkLoading(true);
      setError(null);
      const saved = sessionStorage.getItem(requestKey);
      const previous = creationRequest.current ?? (saved ? JSON.parse(saved) : null);
      if (previous && previous.quota !== quota) { setError('Reprenez la demande précédente avec le même volume avant de le modifier.'); return; }
      const request = previous ?? { quota, reference: crypto.randomUUID() };
      creationRequest.current = request;
      sessionStorage.setItem(requestKey, JSON.stringify(request));
      const result = await distributionService.createDistributionLink(campaign.id, quota, null, request.reference);
      if (result.error || !result.data) setError(distributionError(result.error));
      else { sessionStorage.removeItem(requestKey); creationRequest.current = null; await refreshPrivateLinks(); }
    } catch { setError('La réponse est incertaine. Réessayez le même volume : aucun lien supplémentaire ne sera créé.'); }
    finally { creationBusy.current = false; setPrivateLinkLoading(false); }
  }

  /** Copie un lien de distribution, jamais le lien public. */
  async function copyPrivateLink(token: string) {
    try {
      await navigator.clipboard.writeText(privateDistributionUrl(token));
      setPrivateCopiedToken(token);
      setTimeout(() => setPrivateCopiedToken((t) => (t === token ? null : t)), 1800);
    } catch { setError('La copie a échoué. Vous pouvez sélectionner et copier l’adresse manuellement.'); }
  }

  async function changeLinkCredits(link: DistributionLink, refund: boolean) {
    if (linkBusy) return;
    const amount = Number(rechargeAmounts[link.id] ?? '');
    if (!refund && (!/^\d+$/.test(rechargeAmounts[link.id] ?? '') || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000)) {
      setError('Indiquez un entier entre 1 et 1 000 000 crédits.'); return;
    }
    const key = `${refund ? 'refund' : 'recharge'}.${link.id}`;
    const storageKey = `campagnes.distribution.${key}`;
    setLinkBusy(link.id); setError(null);
    try {
      const saved = sessionStorage.getItem(storageKey);
      const previous = creditRequests.current.get(key) ?? (saved ? JSON.parse(saved) : null);
      if (previous && !refund && previous.amount !== amount) throw new Error('Reprenez le volume précédent pour vérifier son affectation.');
      const request = previous ?? { amount, reference: crypto.randomUUID() };
      creditRequests.current.set(key, request);
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      const result = refund ? await distributionService.refund(link.token, request.reference) : await distributionService.recharge(link.token, amount, request.reference);
      if (result.error || result.data !== true) throw new Error(result.error ?? 'Cette opération n’a pas été autorisée.');
      sessionStorage.removeItem(storageKey); creditRequests.current.delete(key);
      await refreshPrivateLinks();
    } catch (e) { setError(e instanceof Error ? e.message : 'Réponse incertaine : réessayez la même opération.'); }
    finally { setLinkBusy(null); }
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
        <Field
          label="Slug"
          hint="Ce qui suit campagnes.app/c/ dans l’adresse publique, éditable tant que la campagne existe."
        >
          <InputPrefix prefix="campagnes.app/c/">
            <Input
              aria-label="Slug de la campagne"
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

        {/*
          Réconciliation du retour de paiement Mobile Money (`?depositId=…`) — montée UNE fois,
          pas dans chaque bouton : l'écran en affiche quatre.
        */}
        <TopupReturnNotice campaignName={campaign.name} />

        {blocked || shouldInviteToTopup(campaign.participants_used, campaign.participants_granted) ? (
          <div className="flex flex-col gap-4 rounded-md border border-gray-200 bg-gray-50 p-4">
            <p className="text-[13px] leading-relaxed text-gray-600">
              {blocked ? (
                <>
                  <span className="font-semibold text-ink">Quota épuisé.</span> Les{' '}
                  {quota} téléchargements inclus ont été consommés : les participants peuvent
                  continuer avec le filigrane Campagnes, ou vous pouvez acheter des crédits pour
                  rétablir les exports propres.
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
                  . Ensuite les exports repasseront avec le filigrane Campagnes.
                </>
              )}
            </p>

            {/*
              Les paliers reprennent la grille de `/tarifs` : mêmes volumes,
              mêmes prix, et le même catalogue (`DISTRIBUTION_PACKS`) des deux
              côtés. Un créateur qui a lu l'une reconnaît l'autre — il n'y a pas
              deux grilles concurrentes.
            */}
            <div className="grid gap-2 sm:grid-cols-2">
              {TOPUP_TIERS.map((tier) => (
                <TopupButton
                  key={tier.downloads}
                  campaignId={campaign.id}
                  campaignName={campaign.name}
                  tier={tier}
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
                </TopupButton>
              ))}
            </div>

            <p className="text-[12px] leading-relaxed text-gray-500">
              Paiement par Mobile Money. Le quota est crédité dès la confirmation du paiement.
              Au-delà de {new Intl.NumberFormat('fr-FR').format(QUOTE_THRESHOLD)}{' '}
              téléchargements, c’est traité directement au devis.
            </p>
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed text-gray-500">
            Chaque téléchargement de votre visuel est compté. À {campaign.participants_granted}, le
            lien continue avec filigrane — vous pourrez alors acheter des crédits par Mobile Money,
            ou passer au devis au-delà de{' '}
            {new Intl.NumberFormat('fr-FR').format(QUOTE_THRESHOLD)} téléchargements.
          </p>
        )}
      </section>

      {/* ---------------- Adresse publique ---------------- */}
      <section className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-[15px] font-semibold">Adresse publique</h2>
          {/*
            Une seule représentation du lien public sur cet écran : le champ
            « Slug » ci-dessus en édite l'adresse, ce bloc l'affiche et la
            partage. Ce titre était « Lien de participation » — même URL, autre
            mot — et invitait à chercher un second lien qui n'existe pas.
          */}
          <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
            Lien public de votre campagne.{' '}
            {campaign.status === 'published'
              ? 'Chacun y dépose sa photo, la place dans votre cadre et repart avec son visuel, sans compte.'
              : 'Il ne sera actif qu’après publication.'}
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

      {/* ---------------- Lien privé de distribution ---------------- */}
      {/*
        Deux liens, deux usages — et ils ne sont pas interchangeables :
          * l'adresse publique ci-dessus est faite pour être partagée largement ;
          * ces liens portent un jeton secret, chacun avec son propre quota. Le
            partager publiquement revient à donner l'accès à tout le monde.

        La liste est **relue depuis la base** à chaque ouverture : le jeton n'est
        pas une valeur d'affichage retenue par le composant, c'est ce que la
        table contient. Un rechargement ne cache donc rien.
      */}
      <section className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-[15px] font-semibold">Lien privé de distribution</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
            Distribuez votre campagne publiée à un public déterminé avec une enveloppe distincte.
            Un lien à jeton, à envoyer à un client ou à une liste précise : il ouvre le
            même parcours que l&apos;adresse publique, mais avec son propre quota
            d&apos;utilisations et sans partage social. Un jeton est un secret — ne le
            publiez pas. La campagne et ses médias restent publics ; ce lien ne garantit pas leur confidentialité.
            Chaque nouvelle enveloppe est financée par les crédits achetés de votre compte.
          </p>
        </div>

        {privateLinksError && <InlineError>{privateLinksError}</InlineError>}

        {privateLinksLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-gray-500">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Chargement des liens…
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {privateLinks.map((link) => {
              const url = privateDistributionUrl(link.token);
              const expired =
                link.status === 'EXPIRED' ||
                (link.expiresAt !== null && Date.parse(link.expiresAt) < Date.now());
              const usable = link.status === 'ACTIVE' && !expired && link.quotaUsed + (link.reservedCount ?? 0) < link.quotaTotal;
              const state =
                link.status === 'REVOKED'
                  ? 'Lien révoqué'
                  : expired
                    ? 'Lien expiré'
                    : link.status === 'QUOTA_EXCEEDED'
                      ? 'Quota épuisé'
                      : null;

              return (
                <li
                  key={link.id}
                  className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-gray-200 bg-white px-3 py-2.5 font-mono text-[12px] text-gray-700">
                      {url}
                    </code>
                    <Button
                      variant="ghost"
                      onClick={() => void copyPrivateLink(link.token)}
                      disabled={!usable}
                    >
                      {privateCopiedToken === link.token ? (
                        <>
                          <Check className="size-4 text-success" aria-hidden /> Copié
                        </>
                      ) : (
                        <>
                          <Copy className="size-4" strokeWidth={1.75} aria-hidden /> Copier
                        </>
                      )}
                    </Button>
                    {usable ? (
                      <ButtonLink href={url} variant="secondary">
                        <ExternalLink className="size-4" strokeWidth={1.75} aria-hidden />
                        Ouvrir
                      </ButtonLink>
                    ) : (
                      <Button variant="secondary" disabled>
                        <ExternalLink className="size-4" strokeWidth={1.75} aria-hidden />
                        Ouvrir
                      </Button>
                    )}
                    {/* Révocation : définitive. Un lien mort reste visible pour la
                        traçabilité, mais ne sera plus résolvable. */}
                    {link.status !== 'REVOKED' && (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm('Révoquer ce lien ? Cette action est définitive.')) return;
                          const result = await distributionService.revokeDistributionLink(link.token);
                          if (result.error || result.data !== true) {
                            setError(result.error ?? 'La révocation n’a pas été autorisée.');
                          } else {
                            await refreshPrivateLinks();
                          }
                        }}
                        className="text-error hover:text-error/80"
                      >
                        <Trash2 className="size-4" strokeWidth={1.75} aria-hidden />
                        Révoquer
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-500">
                    <span className="font-medium text-gray-700">
                      {fmtCount.format(link.quotaTotal)} utilisation
                      {link.quotaTotal > 1 ? 's' : ''}
                    </span>
                    <span>
                      {fmtCount.format(link.quotaUsed)} / {fmtCount.format(link.quotaTotal)} utilisées
                    </span>
                    <span>
                      Créé le {fmtDate.format(new Date(link.createdAt))}
                    </span>
                    <span>
                      {link.expiresAt
                        ? `Expire le ${fmtDate.format(new Date(link.expiresAt))}`
                        : 'Sans expiration'}
                    </span>
                    {state && <span className="font-medium text-error">{state}</span>}
                  </div>

                  <p className="text-[12px] text-gray-500">
                    Historique : {fmtCount.format(link.historyUsed ?? 0)} · Exports confirmés : {fmtCount.format(link.confirmedCount ?? 0)} · Réservations : {fmtCount.format(link.reservedCount ?? 0)}
                    {link.fundingOrigin === 'historical' ? ' · Enveloppe historique conservée' : ' · Enveloppe financée'}
                    {link.historyDelta ? ` · Écart historique : ${link.historyDelta}` : ''}
                  </p>
                  <details className="rounded-md border border-gray-200 bg-white p-2">
                    <summary className="cursor-pointer text-[13px] text-gray-600">••• Options du lien</summary>
                    {!expired && link.status !== 'REVOKED' && (
                      <div className="my-3 flex flex-wrap items-center gap-2">
                        <Input type="number" min={1} max={1000000} step={1} aria-label="Crédits à ajouter au lien" value={rechargeAmounts[link.id] ?? ''}
                          onChange={(e) => setRechargeAmounts((current) => ({ ...current, [link.id]: e.target.value }))} className="w-40" />
                        <Button variant="secondary" size="sm" disabled={linkBusy !== null} onClick={() => void changeLinkCredits(link, false)}>Affecter des crédits</Button>
                      </div>
                    )}
                    {(expired || link.status === 'REVOKED') && link.fundingOrigin !== 'historical' && (
                      <Button variant="secondary" size="sm" className="my-3" disabled={linkBusy !== null} onClick={() => void changeLinkCredits(link, true)}>Restituer les crédits achetés non utilisés</Button>
                    )}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-gray-500">
                      Logo client (URL)
                    </label>
                    <Input
                      type="url"
                      placeholder="https://…"
                      defaultValue={link.clientLogoUrl ?? ''}
                      onBlur={async (e) => {
                        const val = e.target.value.trim() || null;
                        if (val === (link.clientLogoUrl ?? null)) return;
                        try {
                          const result = await distributionService.updateClientLogo(link.token, val);
                          if (result.error) { setError(result.error); return; }
                          await refreshPrivateLinks();
                        } catch { setError('Le logo n’a pas été enregistré. Réessayez.'); }
                      }}
                      className="h-8 text-[12px]"
                    />
                  </div>

                  </details>
                  <p className="text-[12px] leading-relaxed text-gray-500">
                    Ce lien distribue la campagne selon le quota défini — indépendant du
                    quota de la campagne.
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {/* Création : toujours proposée, un lien n'en ferme pas un autre. */}
        <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
          <Field
            label="Nombre d'utilisations"
            htmlFor="private-quota"
            hint="Crédits du compte affectés à ce lien, sans toucher au quota public."
            className="w-44"
          >
            <Input
              id="private-quota"
              type="number"
              min={1}
              step={1}
              value={privateQuota}
              onChange={(e) => setPrivateQuota(e.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => void generatePrivateLink()}
            disabled={privateLinkLoading || campaign.status !== 'published' || !campaign.frame_id}
          >
            {privateLinkLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Génération…
              </>
            ) : (
              <>
                <Link2 className="size-4" strokeWidth={1.75} aria-hidden />
                Générer le lien
              </>
            )}
          </Button>
        </div>
      </section>


      {/* ---------------- Partage social ---------------- */}
      <section className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-start gap-2.5">
          <Share2 className="mt-0.5 size-4 shrink-0 text-purple" strokeWidth={1.75} aria-hidden />
          <div>
            <h2 className="text-[15px] font-semibold">Partage social</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
              Ce que vos participants verront au moment de partager. Laissez vide et Campagnes
              rédige un texte à partir du nom de la campagne.
            </p>
          </div>
        </div>

        <Field
          label="Texte de partage"
          htmlFor="share-text"
          hint="Le lien public et les hashtags sont ajoutés automatiquement s’ils manquent."
        >
          <Textarea
            id="share-text"
            rows={3}
            value={shareText}
            onChange={(e) => setShareText(e.target.value)}
            placeholder={`Je participe à ${name || 'la campagne'} ✨`}
          />
        </Field>

        <Field
          label="Hashtags"
          htmlFor="share-hashtags"
          hint={`Jusqu’à ${MAX_CUSTOM_HASHTAGS}. Séparez-les par une espace ou une virgule — le # est facultatif.`}
        >
          <Input
            id="share-hashtags"
            value={shareHashtags}
            onChange={(e) => setShareHashtags(e.target.value)}
            placeholder="SIAO, BurkinaFaso"
          />
        </Field>

        {automaticTags.length > 0 && (
          <p className="text-xs leading-relaxed text-gray-500">
            Ajoutés automatiquement :{' '}
            <span className="font-medium text-ink">{BRAND_HASHTAG}</span> et{' '}
            <span className="font-medium text-ink">{automaticTags.join(' ')}</span>.
          </p>
        )}

        <div>
          <span className="text-xs font-medium text-gray-700">Aperçu du message</span>
          <div className="mt-1.5 rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-gray-700">
              {sharePreview}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => void saveShare()} disabled={shareState === 'saving'}>
            {shareState === 'saving' ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Enregistrement…
              </>
            ) : shareState === 'saved' ? (
              <>
                <Check className="size-4 text-success" aria-hidden />
                Enregistré
              </>
            ) : (
              'Enregistrer le partage'
            )}
          </Button>

          {campaign.status !== 'published' && (
            <span className="text-xs leading-relaxed text-gray-500">
              Le partage ne devient actif qu’après publication.
            </span>
          )}
        </div>

        {shareError && <InlineError>{shareError}</InlineError>}
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
