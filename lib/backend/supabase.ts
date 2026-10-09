import type {
  Campaign,
  CampaignWithFrame,
  CreatorProfile,
  Descriptor,
  Frame,
  GalleryItem,
  PaymentRecord,
  PlanKind,
  User,
} from '@/lib/types';
import { parseDescriptor } from '@/lib/descriptor';
import { isCampaignKind } from '@/lib/campaign-kinds';
import { FREE_DOWNLOADS, toClaim, toQuota } from '@/lib/quota';
import { FREE_MAX_CAMPAIGNS, maxCampaigns } from '@/lib/plans';
import {
  ABANDONED_PAYMENT_WINDOW_MS,
  REFUSED_PAYMENT_CODE,
  isVisibleInPaymentHistory,
  toPaymentRecord,
  type PaymentRow,
} from '@/lib/payments/history';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { ShareEventType, ShareStats } from '@/lib/share';
import { MEDIA_BUCKET, REPORTS_BUCKET, SITE_URL } from './config';
import type {
  Backend,
  CreateCampaignInput,
  DistributionLink,
  DistributionLinkStatus,
  PrivateCampaignAccess,
  DistributionExportReceipt,
  ParticipationClaim,
  Result,
  SignUpOutcome,
  UpdateProfilePatch,
} from './types';

/**
 * Implémentation réelle : Supabase Auth + Postgres + RLS + Storage.
 * Toute la sécurité repose sur les policies de `supabase/migrations/0001_init.sql`.
 */

type Row = Record<string, unknown>;

/**
 * Message unique du refus de création au-delà de la limite Gratuit.
 *
 * Le client, le mode démo et la remontée du trigger SQL aboutissent tous à
 * cette phrase : un même refus ne s'écrit qu'une fois.
 */
function freeCampaignLimitMessage(cap: number): string {
  return `La formule Gratuit est limitée à ${cap} campagne. Passez à la formule Créateur pour en créer davantage.`;
}

function rowToUser(row: Row): User {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    username: String(row.username ?? ''),
    org_name: (row.org_name as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    plan: (row.plan as User['plan']) ?? 'free',
    // Migration 0020 : absent tant qu'elle n'est pas appliquée, d'où le repli.
    plan_expires_at: (row.plan_expires_at as string | null) ?? null,
    onboarded_at: (row.onboarded_at as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function rowToFrame(row: Row): Frame {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    name: String(row.name ?? 'Cadre'),
    descriptor_json: parseDescriptor(row.descriptor_json),
    thumbnail_url: (row.thumbnail_url as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

/**
 * Projection publique d'un créateur — la vue `creator_profiles` ne porte ni email ni plan,
 * seulement l'effet visible de la formule (`watermark`).
 */
function rowToCreator(row: Row): CreatorProfile {
  return {
    id: String(row.id),
    username: String(row.username ?? ''),
    org_name: (row.org_name as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    // En cas de doute on filigrane : mieux vaut un export marqué qu'un export
    // qui contourne la formule par accident.
    watermark: row.watermark === undefined ? true : Boolean(row.watermark),
  };
}

function rowToCampaign(row: Row): Campaign {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    frame_id: (row.frame_id as string | null) ?? null,
    ratio: (row.ratio as Campaign['ratio']) ?? '1:1',
    // Le défaut de la migration vaut 'photo_frame' : une campagne lue sans
    // cette colonne est donc une campagne photo, jamais une campagne sans type.
    kind: isCampaignKind(row.kind) ? row.kind : 'photo_frame',
    status: (row.status as Campaign['status']) ?? 'draft',
    // Le défaut reprend celui de la migration 0005 : une campagne lue sans ces
    // colonnes n'est pas une campagne sans quota, c'est une campagne à 10
    // téléchargements, dont aucun n'a encore été consommé.
    participants_used: numOr(row.participants_used, 0),
    participants_granted: numOr(row.participants_granted, FREE_DOWNLOADS),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

/** Nombre lisible, avec repli. `NaN` n'est jamais un compteur. */
function numOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Message d'erreur lisible — jamais de stack technique montrée à l'utilisateur. */
function message(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const raw = String((error as { message: unknown }).message);
    if (/Invalid login credentials/i.test(raw)) return 'Email ou mot de passe incorrect.';
    if (/already registered/i.test(raw)) return 'Un compte existe déjà avec cette adresse.';
    if (/duplicate key.*username/i.test(raw)) return 'Ce nom d’utilisateur est déjà pris.';
    if (/duplicate key.*slug/i.test(raw)) return 'Ce slug est déjà utilisé.';
    if (/Password should be at least/i.test(raw)) return 'Le mot de passe doit contenir au moins 6 caractères.';
    // Une colonne absente ne veut pas dire « erreur de l'utilisateur » : elle
    // veut dire que la base n'a pas encore reçu la migration correspondante.
    // Afficher le message Postgres brut ferait porter au créateur une faute qui
    // n'est pas la sienne, et ne lui dirait pas quoi faire.
    if (/column .* does not exist|could not find the .* column|schema cache/i.test(raw))
      return "Cette option n'est pas encore disponible : la base de données n'a pas reçu sa dernière mise à jour.";
    // Supabase plafonne fortement les envois d'emails d'authentification. Dire
    // « trop de tentatives » laissait croire à une faute de l'utilisateur : on
    // nomme la vraie limite et on donne la marche à suivre.
    if (/rate limit|too many requests/i.test(raw))
      return "Le service d'email a atteint sa limite d'envoi pour cette heure. Patientez avant de réessayer — si votre compte a déjà été confirmé, connectez-vous directement.";
    return raw;
  }
  return fallback;
}

/**
 * Nombre de likes d'une campagne, pour un écran qui lit une campagne seule.
 *
 * La vue `campaign_stats` est une source unique : on ne recompte rien ici.
 * Un échec vaut zéro — un compteur absent ne doit pas empêcher l'écran de
 * s'afficher, il doit simplement afficher « 0 ».
 */
async function likeCount(sb: ReturnType<typeof supabaseBrowser>, campaignId: string): Promise<number> {
  const { data } = await sb
    .from('campaign_stats')
    .select('likes_count')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  return Number((data as { likes_count?: number } | null)?.likes_count ?? 0);
}

/** L'utilisateur courant a-t-il aimé cette campagne ? */
async function likedByMe(
  sb: ReturnType<typeof supabaseBrowser>,
  campaignId: string,
): Promise<boolean> {
  const { data } = await sb
    .from('campaign_stats')
    .select('liked_by_me')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  return Boolean((data as { liked_by_me?: boolean } | null)?.liked_by_me);
}

export const supabaseBackend: Backend = {
  mode: 'supabase',

  /* --- Session ------------------------------------------------------ */
  async getSessionUser() {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;

    const { data: row } = await sb.from('users').select('*').eq('id', data.user.id).maybeSingle();
    if (row) return rowToUser(row as Row);

    // Le trigger `on_auth_user_created` n'a pas encore tourné (latence) : on crée.
    const fallbackUsername = `createur${data.user.id.replace(/-/g, '').slice(0, 8)}`;
    const { data: created } = await sb
      .from('users')
      .insert({
        id: data.user.id,
        email: data.user.email ?? '',
        username: fallbackUsername,
      })
      .select('*')
      .maybeSingle();

    return created ? rowToUser(created as Row) : null;
  },

  onAuthStateChange(cb) {
    const sb = supabaseBrowser();
    const { data } = sb.auth.onAuthStateChange(() => {
      void this.getSessionUser().then(cb);
    });
    return () => data.subscription.unsubscribe();
  },

  /* --- Authentification --------------------------------------------- */
  async signUpWithEmail(email, password, username): Promise<SignUpOutcome> {
    const sb = supabaseBrowser();
    const { data, error } = await sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback?next=/onboarding`,
        data: username ? { username: username.trim().toLowerCase() } : undefined,
      },
    });
    if (error) return { error: message(error, "L'inscription a échoué.") };
    return { needsEmailConfirmation: !data.session };
  },

  /**
   * Renvoie l'email de confirmation. Supabase ne révèle jamais si l'adresse
   * existe déjà : on relaie donc toujours un succès, sinon l'écran de
   * confirmation deviendrait un oracle pour énumérer les comptes.
   */
  async resendConfirmation(email): Promise<Result> {
    const sb = supabaseBrowser();
    const { error } = await sb.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=/onboarding` },
    });
    if (error && /rate limit/i.test(error.message)) {
      return {
        error:
          "L'envoi d'emails est limité par le service d'authentification. Réessayez dans une heure.",
      };
    }
    return {};
  },

  async signInWithEmail(email, password): Promise<Result> {
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { error: message(error, 'La connexion a échoué.') };
    return {};
  },

  async signInWithGoogle(next?: string | null): Promise<Result> {
    const sb = supabaseBrowser();
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/onboarding';
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext)}` },
    });
    if (error) return { error: message(error, 'La connexion Google a échoué.') };
    return {};
  },

  async signOut() {
    await supabaseBrowser().auth.signOut();
  },

  /* --- Profil ------------------------------------------------------- */
  async getProfile(userId) {
    const { data } = await supabaseBrowser().from('users').select('*').eq('id', userId).maybeSingle();
    return data ? rowToUser(data as Row) : null;
  },

  async updateProfile(userId, patch: UpdateProfilePatch): Promise<Result> {
    const { error } = await supabaseBrowser().from('users').update(patch).eq('id', userId);
    return error ? { error: message(error, 'La mise à jour a échoué.') } : {};
  },

  async updateEmail(email): Promise<Result> {
    const { error } = await supabaseBrowser().auth.updateUser({ email: email.trim().toLowerCase() });
    if (error) return { error: message(error, 'Le changement d’email a échoué.') };
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (data.user) await sb.from('users').update({ email: email.trim().toLowerCase() }).eq('id', data.user.id);
    return {};
  },

  async updatePassword(password): Promise<Result> {
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    return error ? { error: message(error, 'Le changement de mot de passe a échoué.') } : {};
  },

  async deleteAccount(): Promise<Result> {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (!data.user) return { error: 'Non connecté.' };

    // RLS autorise la suppression de sa propre ligne ; les FK en cascade
    // suppriment frames et campaigns. La ligne auth.users reste à la charge
    // d'un appel serveur (Edge Function) en production.
    const { error } = await sb.from('users').delete().eq('id', data.user.id);
    if (error) return { error: message(error, 'La suppression du compte a échoué.') };
    await sb.auth.signOut();
    return {};
  },

  async isUsernameAvailable(username) {
    // On passe par la fonction `username_available` (migration 0003) et non par un
    // `select` sur `users` : la policy `users_select_self` n'autorise à lire que sa
    // propre ligne, donc une requête filtrée par pseudo répondrait « libre » pour
    // tout pseudo déjà pris par quelqu'un d'autre. La fonction, elle, répond par un
    // simple booléen sans jamais laisser lire de ligne.
    const { data, error } = await supabaseBrowser().rpc('username_available', {
      p_username: username,
    });
    // En cas d'échec, on laisse tenter : la contrainte d'unicité tranchera à
    // l'enregistrement. Refuser un pseudo à cause d'une panne réseau serait pire.
    if (error) return true;
    return data === true;
  },

  async getCreatorProfile(username): Promise<CreatorProfile | null> {
    // On lit la VUE publique, jamais la table `users` (qui contient email et plan).
    // `watermark` doit figurer dans la projection : sans lui, la vue renverrait
    // `undefined` et un créateur Free passerait pour payant.
    const { data } = await supabaseBrowser()
      .from('creator_profiles')
      .select('id, username, org_name, logo_url, created_at, watermark')
      .eq('username', username)
      .maybeSingle();
    return data ? rowToCreator(data as Row) : null;
  },

  /* --- Cadres ------------------------------------------------------- */
  async createFrame(ownerId, name, descriptor): Promise<Result<Frame>> {
    const { data, error } = await supabaseBrowser()
      .from('frames')
      .insert({ owner_id: ownerId, name, descriptor_json: descriptor })
      .select('*')
      .single();
    if (error) return { error: message(error, 'La création du cadre a échoué.') };
    return { data: rowToFrame(data as Row) };
  },

  async saveFrame(frameId, descriptor, thumbnailUrl): Promise<Result> {
    const patch: Row = { descriptor_json: descriptor };
    if (thumbnailUrl !== undefined) patch.thumbnail_url = thumbnailUrl;
    const { error } = await supabaseBrowser().from('frames').update(patch).eq('id', frameId);
    return error ? { error: message(error, 'L’enregistrement du cadre a échoué.') } : {};
  },

  async getFrame(frameId) {
    const { data } = await supabaseBrowser().from('frames').select('*').eq('id', frameId).maybeSingle();
    return data ? rowToFrame(data as Row) : null;
  },

  /* --- Campagnes ---------------------------------------------------- */
  async listCampaigns(ownerId): Promise<CampaignWithFrame[]> {
    const sb = supabaseBrowser();
    const { data, error } = await sb
      .from('campaigns')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];

    const campaigns = (data as Row[]).map(rowToCampaign);
    const frameIds = campaigns.map((c) => c.frame_id).filter((id): id is string => Boolean(id));
    if (frameIds.length === 0) return campaigns.map((c) => ({ ...c, frame: null }));

    const { data: frames } = await sb.from('frames').select('*').in('id', frameIds);
    const byId = new Map<string, Frame>();
    (frames as Row[] | null)?.forEach((f) => {
      const frame = rowToFrame(f);
      byId.set(frame.id, frame);
    });

    return campaigns.map((c) => ({ ...c, frame: c.frame_id ? byId.get(c.frame_id) ?? null : null }));
  },

  async listPublishedCampaigns(ownerId): Promise<CampaignWithFrame[]> {
    const all = await this.listCampaigns(ownerId);
    return all.filter((c) => c.status === 'published');
  },

  async getCampaign(campaignId): Promise<CampaignWithFrame | null> {
    const sb = supabaseBrowser();
    const { data } = await sb.from('campaigns').select('*').eq('id', campaignId).maybeSingle();
    if (!data) return null;
    const campaign = rowToCampaign(data as Row);
    const frame = campaign.frame_id ? await this.getFrame(campaign.frame_id) : null;
    return { ...campaign, frame };
  },

  async createCampaign(input: CreateCampaignInput): Promise<Result<Campaign>> {
    /*
     * La formule Gratuit est limitée à 1 campagne par compte : sans cette
     * limite, créer une campagne neuve redonnerait un quota offert complet.
     * Le contrôle ici donne un message clair ; le trigger
     * `enforce_free_campaign_limit` (migration 0023) reste le filet côté base
     * — un appel direct à l'API ne contourne rien.
     */
    const { data: owner } = await supabaseBrowser()
      .from('users')
      .select('plan')
      .eq('id', input.ownerId)
      .maybeSingle();
    const cap = maxCampaigns((owner as { plan?: string } | null)?.plan ?? null);
    if (cap !== null) {
      const { count } = await supabaseBrowser()
        .from('campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', input.ownerId);
      if ((count ?? 0) >= cap) {
        return { error: freeCampaignLimitMessage(cap) };
      }
    }

    const { data, error } = await supabaseBrowser()
      .from('campaigns')
      .insert({
        owner_id: input.ownerId,
        name: input.name,
        slug: input.slug,
        ratio: input.ratio,
        kind: input.kind,
        status: 'draft',
      })
      .select('*')
      .single();
    if (error) {
      // Le trigger a tranché (création concurrente, ou appel hors client) :
      // on s'aligne sur son verdict, avec le même message.
      if (error.message?.includes('FREE_CAMPAIGN_LIMIT')) {
        return { error: freeCampaignLimitMessage(FREE_MAX_CAMPAIGNS) };
      }
      return { error: message(error, 'La création de la campagne a échoué.') };
    }
    return { data: rowToCampaign(data as Row) };
  },

  async updateCampaign(campaignId, patch): Promise<Result> {
    const { error } = await supabaseBrowser().from('campaigns').update(patch).eq('id', campaignId);
    return error ? { error: message(error, 'La mise à jour de la campagne a échoué.') } : {};
  },

  async deleteCampaign(campaignId): Promise<Result> {
    const { error } = await supabaseBrowser().from('campaigns').delete().eq('id', campaignId);
    return error ? { error: message(error, 'La suppression a échoué.') } : {};
  },

  async listSlugs() {
    const { data } = await supabaseBrowser().from('campaigns').select('slug');
    return (data as { slug: string }[] | null)?.map((r) => r.slug) ?? [];
  },

  /* --- Quota de téléchargements --------------------------------------- */
  /**
   * Réservation atomique : c'est la fonction SQL qui prend le verrou de ligne.
   * Ne pas la remplacer par un « lire puis incrémenter » côté client : deux
   * participants qui téléchargent au même instant consommeraient deux fois la
   * dernière place.
   *
   * Elle est ouverte à `anon` : c'est tout le principe du parcours participant,
   * aucun compte, aucune inscription. Elle n'incrémente que d'une unité.
   */
  async claimParticipation(campaignId) {
    const { data, error } = await supabaseBrowser().rpc('claim_participation', {
      p_campaign_id: campaignId,
    });
    if (error) return { error: message(error, 'La réservation a échoué.') };
    // La fonction renvoie une ligne ; PostgREST peut la livrer en tableau.
    return { data: toClaim(data) };
  },

  async getCampaignQuota(campaignId) {
    const { data } = await supabaseBrowser()
      .from('campaign_quota')
      .select('participants_used, participants_granted, open')
      .eq('id', campaignId)
      .maybeSingle();
    if (!data) return null;
    return toQuota(
      numOr((data as Record<string, unknown>).participants_used, 0),
      numOr((data as Record<string, unknown>).participants_granted, FREE_DOWNLOADS),
    );
  },

  async grantParticipation(campaignId, downloads) {
    // Écriture d'un volume déjà payé et validé hors du produit. On lit d'abord
    // pour additionner : le `granted` n'est jamais recalculé ailleurs.
    const { data, error } = await supabaseBrowser()
      .from('campaigns')
      .select('participants_granted')
      .eq('id', campaignId)
      .maybeSingle();
    if (error) return { error: message(error, 'La lecture a échoué.') };
    if (!data) return { error: 'Campagne introuvable.' };

    const current = numOr(
      (data as Record<string, unknown>).participants_granted,
      FREE_DOWNLOADS,
    );
    const { error: writeError } = await supabaseBrowser()
      .from('campaigns')
      .update({ participants_granted: current + downloads })
      .eq('id', campaignId);
    if (writeError) return { error: message(writeError, "L'extension a échoué.") };
    return {};
  },

  /* --- Galerie publique --------------------------------------------- */
  async listGallery(): Promise<GalleryItem[]> {
    const sb = supabaseBrowser();

    // RLS fait le travail : la policy `campaigns_select_owner_or_published`
    // ne laisse passer que `status = 'published'` pour un visiteur anonyme.
    const { data, error } = await sb
      .from('campaigns')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(120);
    if (error || !data) return [];

    const campaigns = (data as Row[]).map(rowToCampaign);
    if (campaigns.length === 0) return [];

    const frameIds = [
      ...new Set(campaigns.map((c) => c.frame_id).filter((id): id is string => Boolean(id))),
    ];
    const ownerIds = [...new Set(campaigns.map((c) => c.owner_id))];

    const framesById = new Map<string, Frame>();
    if (frameIds.length > 0) {
      const { data: frames } = await sb.from('frames').select('*').in('id', frameIds);
      ((frames as Row[] | null) ?? []).forEach((f) => {
        const frame = rowToFrame(f);
        framesById.set(frame.id, frame);
      });
    }

    // La vue `creator_profiles` ne contient que les champs publics.
    const creatorsById = new Map<string, CreatorProfile>();
    const { data: creators } = await sb
      .from('creator_profiles')
      .select('id, username, org_name, logo_url, created_at, watermark')
      .in('id', ownerIds);
    ((creators as Row[] | null) ?? []).forEach((c) => {
      creatorsById.set(String(c.id), rowToCreator(c));
    });

    /*
     * Les deux compteurs des cartes de galerie.
     *
     * `usageCount` vient de `participants_used`, le compteur de téléchargements
     * déjà posé par la migration 0007 : un téléchargement **est** une
     * utilisation, et cette colonne est incrémentée sous verrou de ligne. On ne
     * crée donc pas de second compteur, qui finirait par diverger du premier.
     *
     * `likesCount` et `likedByMe` viennent de la vue `campaign_stats`, qui
     * agrège le total et n'expose le booléen qu'à l'appelant.
     */
    const { data: stats } = await sb.from('campaign_stats').select('*');
    const statsByCampaign = new Map<string, { likes_count: number; liked_by_me: boolean }>();
    ((stats as Row[] | null) ?? []).forEach((s) => {
      statsByCampaign.set(String(s.campaign_id), {
        likes_count: Number(s.likes_count ?? 0),
        liked_by_me: Boolean(s.liked_by_me),
      });
    });

    return campaigns.map((c) => {
      const stats = statsByCampaign.get(c.id);
      return {
        ...c,
        frame: c.frame_id ? framesById.get(c.frame_id) ?? null : null,
        creator: creatorsById.get(c.owner_id) ?? null,
        usageCount: c.participants_used ?? 0,
        likesCount: stats?.likes_count ?? 0,
        likedByMe: stats?.liked_by_me ?? false,
      };
    });
  },

  /**
   * Ajoute ou retire le like de l'utilisateur courant.
   *
   * Tout se joue dans `toggle_campaign_like` : le navigateur ne touche jamais
   * `campaign_likes`. Une écriture directe depuis le client serait un compteur
   * que l'on pourrait gonfler sans passer par la fonction, et donc sans le
   * verrou de ligne — c'est-à-dire sans garantie d'exactitude.
   */
  async toggleCampaignLike(campaignId) {
    const { data, error } = await supabaseBrowser().rpc('toggle_campaign_like', {
      p_campaign_id: campaignId,
    });

    if (error) {
      /*
       * Le refus d'un visiteur n'est pas une panne. `toggle_campaign_like`
       * lève une erreur 42501 quand `auth.uid()` est nul : la traduire en
       * « connexion requise » évite d'afficher une erreur technique à quelqu'un
       * qui n'a fait qu'appuyer sur un cœur.
       */
      if (error.code === '42501') {
        return { error: 'Connectez-vous pour aimer cette campagne.' };
      }
      return { error: message(error, "L'enregistrement du like a échoué.") };
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { liked?: boolean; likes_count?: number }
      | null;
    if (!row) return { error: "L'enregistrement du like a échoué." };

    return { data: { liked: Boolean(row.liked), likesCount: Number(row.likes_count ?? 0) } };
  },

  /**
   * Entrée du parcours participant. Le filtre `status = 'published'` est explicite
   * en plus de la policy : un brouillon doit être indiscernable d'un slug inexistant.
   */
  async getPublicCampaign(slug): Promise<GalleryItem | null> {
    const sb = supabaseBrowser();

    const { data } = await sb
      .from('campaigns')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    if (!data) return null;

    const campaign = rowToCampaign(data as Row);
    const frame = campaign.frame_id ? await this.getFrame(campaign.frame_id) : null;

    const { data: creator } = await sb
      .from('creator_profiles')
      .select('id, username, org_name, logo_url, created_at, watermark')
      .eq('id', campaign.owner_id)
      .maybeSingle();

    return {
      ...campaign,
      frame,
      creator: creator ? rowToCreator(creator as Row) : null,
      usageCount: campaign.participants_used ?? 0,
      likesCount: await likeCount(sb, campaign.id),
      likedByMe: await likedByMe(sb, campaign.id),
    };
  },

  /* --- Liens privés de distribution --------------------------------- */
  /**
   * `create_distribution_link` est `security definer` et vérifie elle-même que
   * l'appelant est le propriétaire de la campagne. Le navigateur n'a donc aucun
   * droit d'écriture direct sur `distribution_links`.
   */
  async createDistributionLink(campaignId, quota, expiresAt, reference): Promise<Result<string>> {
    if (!Number.isSafeInteger(quota) || quota <= 0 || quota > 1000000) return { error: 'Indiquez un entier entre 1 et 1 000 000.' };
    const { data, error } = await supabaseBrowser().rpc('create_funded_distribution_link_v1', {
      p_reference: reference ?? crypto.randomUUID(),
      p_campaign_id: campaignId,
      p_quota: quota,
      p_expires_at: expiresAt ?? null,
    });
    if (error) return { error: message(error, 'Impossible de créer le lien privé.') };
    if (typeof data !== 'string' || data.length === 0) {
      return { error: "Le lien privé n'a pas pu être créé." };
    }
    return { data };
  },

  /**
   * Les liens déjà créés, **relus depuis la base** — c'est ce qui rend un jeton
   * persistant : il survit au rechargement de la page.
   *
   * Une simple lecture, sans RPC : la policy `distribution_links_owner`
   * (migration 0009) restreint déjà les lignes au propriétaire de la campagne.
   * Ajouter un filtre `owner_id` ici ne protégerait rien de plus et laisserait
   * croire que la sélection est l'affaire du navigateur. Un anonyme reçoit donc
   * une liste vide par construction, jamais par politesse.
   */
  async listDistributionLinks(campaignId): Promise<Result<DistributionLink[]>> {
    const { data, error } = await supabaseBrowser().rpc('get_distribution_links_v1', {
      p_campaign_id: campaignId,
    });

    if (error) return { error: message(error, 'Impossible de lire les liens de distribution.') };

    const rows = (data ?? []) as Row[];
    return {
      data: rows.map((row) => ({
        id: String(row.id),
        token: String(row.token),
        quotaTotal: Number(row.quota_total ?? 0),
        quotaUsed: Number(row.quota_used ?? 0),
        historyUsed: Number(row.history_used ?? 0),
        confirmedCount: Number(row.confirmed_count ?? 0),
        reservedCount: Number(row.reserved_count ?? 0),
        historyDelta: Number(row.history_delta ?? 0),
        fundingOrigin: row.funding_origin as DistributionLink['fundingOrigin'],
        refundableCount: Number(row.refundable_count ?? 0),
        // La colonne porte une contrainte `check` : toute valeur inconnue est
        // impossible en base. On tombe sur `ACTIVE` par sécurité plutôt que de
        // laisser un libellé vide à l'écran.
        status: (String(row.status ?? 'ACTIVE') as DistributionLinkStatus) || 'ACTIVE',
        expiresAt: (row.expires_at as string | null) ?? null,
        createdAt: String(row.created_at ?? ''),
        clientLogoUrl: (row.client_logo_url as string | null) ?? null,
      })),
    };
  },

  /**
   * Un visiteur anonyme ne peut pas lire `distribution_links` : `resolve_distribution`
   * lui rend seulement l'identifiant de la campagne, jamais le jeton, le quota ou
   * l'échéance. Aucune unité de quota n'est consommée à l'ouverture de la page.
   */
  async getPrivateCampaign(token): Promise<GalleryItem | null> {
    const access = await this.getPrivateAccess(token);
    return access.data?.kind === 'distributed' ? access.data.campaign : null;
  },

  async getPrivateAccess(token, resume): Promise<Result<PrivateCampaignAccess>> {
    const sb = supabaseBrowser();

    const { data, error } = resume
      ? await sb.rpc('resolve_distribution_resume_v1', { p_token: token, p_operation_id: resume.operationId,
          p_secret: resume.secret, p_format: resume.format, p_descriptor_hash: resume.descriptorHash })
      : await sb.rpc('resolve_distribution', { p_token: token });
    if (error) return { error: 'Impossible de vérifier ce lien. Réessayez dans un instant.' };
    if (!data) return { data: { kind: 'unavailable' } };
    if (typeof data !== 'object' || data.protocol_version !== 1) return { error: 'La distribution nécessite la mise à jour de la base de données.' };

    /*
     * La migration 0015 a changé le retour de `resolve_distribution` :
     * avant `uuid`, maintenant `jsonb { campaign_id, client_logo_url }`.
     * On accepte les deux formes pour ne pas casser en cas de désynchronisation
     * temporaire entre le client et la base.
     */
    let campaignId: string | null = null;
    let clientLogoUrl: string | null = null;
    if (typeof data === 'string') {
      campaignId = data;
    } else if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      campaignId = typeof obj.campaign_id === 'string' ? obj.campaign_id : null;
      clientLogoUrl = typeof obj.client_logo_url === 'string' ? obj.client_logo_url : null;
    }
    if (!campaignId) return { data: { kind: 'unavailable' } };

    const { data: row, error: campaignError } = await sb
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('status', 'published')
      .maybeSingle();
    if (campaignError) return { error: 'Impossible de charger cette campagne.' };
    if (!row) return { data: { kind: 'unavailable' } };

    const campaign = rowToCampaign(row as Row);
    const { data: frameRow, error: frameError } = await sb.from('frames').select('*').eq('id', campaign.frame_id).maybeSingle();
    if (frameError) return { error: 'Impossible de charger le cadre. Réessayez.' };
    const frame = frameRow ? rowToFrame(frameRow as Row) : null;
    if (!frame) return { data: { kind: 'unavailable' } };

    const { data: creator, error: creatorError } = await sb
      .from('creator_profiles')
      .select('id, username, org_name, logo_url, created_at, watermark')
      .eq('id', campaign.owner_id)
      .maybeSingle();

    if (creatorError) return { error: 'Impossible de charger les informations du créateur.' };
    return { data: { kind: 'distributed', protocolVersion: 1, campaign: {
      ...campaign, frame,
      creator: creator ? rowToCreator(creator as Row) : null,
      usageCount: 0, likesCount: 0, likedByMe: false, clientLogoUrl,
    } } };
  },

  /**
   * Réserve une unité sur le quota d'un lien privé.
   *
   * La fonction SQL écrit la trace d'usage dans la même transaction que la
   * décrémentation (migration 0014) : le navigateur n'a aucun droit d'écriture
   * direct sur `distribution_usages`, il ne fait que demander la réservation.
   *
   * Un refus n'est PAS une erreur : `granted: false` avec `data` renseigné.
   * Seule une panne réseau ou une fonction absente passe par `error`.
   */
  async claimDistribution(token): Promise<Result<ParticipationClaim>> {
    const { data, error } = await supabaseBrowser().rpc('claim_distribution', {
      p_token: token,
    });
    if (error) return { error: message(error, 'Impossible de réserver cet accès.') };

    // La RPC renvoie un ensemble d'une ligne (ou de zéro).
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { error: 'Impossible de réserver cet accès.' };

    return {
      data: {
        granted: Boolean(row.granted),
        used: Number(row.used ?? 0),
        quota: Number(row.quota ?? 0),
      },
    };
  },

  async updateDistributionLink(token, patch): Promise<Result<void>> {
    const { data, error } = await supabaseBrowser().rpc('update_distribution_logo_v1', {
      p_token: token, p_url: patch.client_logo_url ?? null,
    });
    if (error) return { error: message(error, 'Impossible de modifier le lien.') };
    if (data !== true) return { error: 'Le logo n’a pas été enregistré : lien non autorisé.' };
    return {};
  },

  async distributionExport(action, token, operation): Promise<Result<DistributionExportReceipt>> {
    const { data, error } = await supabaseBrowser().rpc('distribution_export_v1', {
      p_action: action, p_token: token, p_operation_id: operation.operationId,
      p_secret: operation.secret, p_format: operation.format, p_descriptor_hash: operation.descriptorHash,
    });
    if (error) return { error: 'Impossible de vérifier l’opération. Réessayez : aucun nouveau débit ne sera créé.' };
    if (!data || !['RESERVED', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'UNAVAILABLE'].includes(data.state)) return { error: 'Réponse d’export invalide.' };
    return { data: { state: data.state, operationId: data.operation_id, receipt: data.receipt, expiresAt: data.expires_at } };
  },
  async rechargeDistribution(token, amount, reference): Promise<Result<boolean>> {
    const { data, error } = await supabaseBrowser().rpc('recharge_distribution_v1', { p_token: token, p_amount: amount, p_reference: reference });
    return error ? { error: message(error, 'Impossible de recharger ce lien.') } : { data: data === true };
  },
  async refundDistribution(token, reference): Promise<Result<boolean>> {
    const { data, error } = await supabaseBrowser().rpc('refund_distribution_v1', { p_token: token, p_reference: reference });
    return error ? { error: message(error, 'Impossible de restituer les crédits.') } : { data: data === true };
  },

  async revokeDistributionLink(token): Promise<Result<boolean>> {
    const { data, error } = await supabaseBrowser().rpc('revoke_distribution_link', {
      p_token: token,
    });
    if (error) return { error: message(error, 'Impossible de révoquer le lien.') };
    return { data: Boolean(data) };
  },


  /* --- Signalements de contenu -------------------------------------- */
  /**
   * Tout est revalidé en base par `submit_report` : motif, longueurs, format de
   * l'email et fréquence des envois. Le navigateur ne fait que donner un retour
   * rapide — il ne protège rien.
   */
  async submitReport(input): Promise<Result> {
    const { error } = await supabaseBrowser().rpc('submit_report', {
      p_reason: input.reason,
      p_campaign_url: input.campaignUrl || null,
      p_description: input.description,
      p_email: input.email,
      p_attachment_path: input.attachmentPath ?? null,
    });
    if (error) return { error: message(error, "Le signalement n'a pas pu être envoyé.") };
    return {};
  },

  /**
   * Espace privé `reports`. Le chemin est horodaté et porte un identifiant
   * aléatoire : deux personnes ne peuvent pas écraser la pièce jointe l'une de
   * l'autre, même en déposant un fichier au même nom.
   */
  async uploadReportAttachment(file): Promise<Result<string>> {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabaseBrowser()
      .storage.from(REPORTS_BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });
    if (error) return { error: message(error, "La pièce jointe n'a pas pu être envoyée.") };
    return { data: path };
  },

  /* --- Partage social ------------------------------------------------ */
  /**
   * `record_share_event` est `security definer` et revalide elle-même le type
   * de l'événement : la liste de `lib/share.ts` n'est qu'un confort côté
   * navigateur. Elle refuse aussi les brouillons — un événement ne peut pas
   * désigner une campagne que personne ne peut voir.
   *
   * Elle est ouverte à `anon`, comme le parcours participant lui-même.
   */
  async recordShareEvent(campaignId, eventType: ShareEventType): Promise<Result> {
    const { error } = await supabaseBrowser().rpc('record_share_event', {
      p_campaign_id: campaignId,
      p_event_type: eventType,
    });
    if (error) return { error: message(error, "Le partage n'a pas pu être compté.") };
    return {};
  },

  /**
   * Lecture de la vue agrégée. `security_invoker = true` : la RLS de
   * `campaign_events` s'applique, donc un créateur ne lit que ses propres
   * campagnes — le filtre `in` ci-dessous n'est qu'une optimisation.
   */
  async getShareStats(campaignIds): Promise<Record<string, ShareStats>> {
    if (campaignIds.length === 0) return {};

    const { data } = await supabaseBrowser()
      .from('campaign_share_stats')
      .select('campaign_id, total, whatsapp, facebook, tiktok')
      .in('campaign_id', campaignIds);

    const out: Record<string, ShareStats> = {};
    for (const row of (data as Row[] | null) ?? []) {
      out[String(row.campaign_id)] = {
        total: numOr(row.total, 0),
        whatsapp: numOr(row.whatsapp, 0),
        facebook: numOr(row.facebook, 0),
        tiktok: numOr(row.tiktok, 0),
      };
    }
    return out;
  },

  /* --- Formule ------------------------------------------------------ */
  // Depuis la migration 0005, le navigateur ne peut plus écrire `plan` du tout :
  // `set_own_plan` est supprimée, et `set_user_plan` est réservée à `service_role`.
  // On ne tente même pas l'appel — un échec de permission remonterait au créateur
  // sous la forme d'un message technique incompréhensible.
  async setPlan(_userId, _plan: PlanKind): Promise<Result> {
    return {
      error:
        'Activez une formule depuis la page Tarifs avec un paiement Mobile Money confirmé.',
    };
  },

  /**
   * Historique des paiements du compte connecté.
   *
   * La lecture passe par `supabaseBrowser()` — le client **de session**, avec la
   * clé anon — et non par la clé `service_role`. C'est la policy
   * `users_select_own_payments` (`auth.uid() = user_id`, migration 0017) qui
   * filtre : passer `ownerId` en paramètre ne donne aucun pouvoir supplémentaire,
   * la base ne rendrait rien d'autre que les lignes de la session.
   *
   * On ne filtre donc pas sur `userId` dans ce code — ce serait un filtre de
   * confort qui laisserait croire que c'est lui qui protège, alors que c'est la
   * RLS. Ne pas passer `userId` à la requête est un choix : il n'aurait aucun
   * effet sur ce que la base renvoie.
   *
   * Ce que l'on filtre en revanche, c'est **ce qui mérite d'être montré** :
   * les paiements annulés, et les abandons une fois la fenêtre écoulée. Voir
   * `isVisibleInPaymentHistory` — c'est là qu'est la règle, elle n'est pas
   * réécrite ici.
   *
   * Le filtre est posé **deux fois**, et ce n'est pas une redondance :
   *   - en SQL, parce que `limit(30)` s'applique AVANT tout filtrage en
   *     mémoire. Sans lui, trente lignes annulées consommeraient tout le
   *     quota et masqueraient un vrai paiement plus ancien ;
   *   - en mémoire, parce que la règle doit rester vraie même si la requête
   *     change. Le SQL est une optimisation, le prédicat est la garantie.
   */
  async listPayments(_userId): Promise<PaymentRecord[]> {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (!data.user) return [];

    /*
     * La même règle, écrite en PostgREST. Elle se lit : « récent, OU ni en
     * attente ni refusé par le client ».
     *
     *   created_at >= fenêtre
     *   OU ( status <> 'pending' ET ( status <> 'failed'
     *                                OU failure_code IS NULL
     *                                OU failure_code <> 'PAYMENT_NOT_APPROVED' ) )
     *
     * La branche `failure_code IS NULL` n'est pas décorative : en SQL,
     * `failure_code <> 'X'` est NULL — donc faux — quand la colonne est NULL.
     * Sans elle, un paiement échoué sans code serait masqué à tort.
     *
     * Un `or` PostgREST se sépare par des virgules ; ni la date ISO ni le code
     * n'en contiennent, ils passent donc tels quels.
     */
    const cutoff = new Date(Date.now() - ABANDONED_PAYMENT_WINDOW_MS).toISOString();

    const { data: rows, error } = await sb
      .from('payments')
      .select(
        'deposit_id, amount, currency, status, plan, campaign_id, purchase_type, metadata, created_at, failure_code, failure_message',
      )
      .neq('status', 'cancelled')
      .or(
        `created_at.gte.${cutoff},` +
          'and(status.neq.pending,' +
          `or(status.neq.failed,failure_code.is.null,failure_code.neq.${REFUSED_PAYMENT_CODE}))`,
      )
      .order('created_at', { ascending: false })
      .limit(30);

    if (error || !rows) return [];

    const now = Date.now();

    return (rows as unknown[])
      .filter((row) => isVisibleInPaymentHistory(row as PaymentRow, now))
      .map((row) => toPaymentRecord(row as Parameters<typeof toPaymentRecord>[0]))
      .filter((record): record is PaymentRecord => record !== null);
  },

  /* --- Médias ------------------------------------------------------- */
  async uploadImage(file, folder): Promise<Result<string>> {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (!data.user) return { error: 'Non connecté.' };

    // Validation stricte : extension + MIME réel (pas de confiance sur file.type)
    const allowedExts = new Set(['png','jpg','jpeg','webp']);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedExts.has(ext)) return { error: 'Format non autorisé. Utilisez PNG, JPG ou WebP.' };
    const mime = file.type || 'image/png';
    const allowedMime = new Set(['image/png','image/jpeg','image/webp']);
    if (!allowedMime.has(mime)) return { error: 'Type MIME non autorisé.' };

    const path = `${data.user.id}/${folder}/${crypto.randomUUID()}.${ext}`;

    const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, file, {
      cacheControl: '31536000',
      upsert: false,
      contentType: mime,
    });
    if (error) return { error: message(error, 'Le téléversement a échoué.') };

    const { data: pub } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return { data: pub.publicUrl };
  },
};
