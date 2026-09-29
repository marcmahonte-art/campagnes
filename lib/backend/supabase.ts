import type {
  Campaign,
  CampaignWithFrame,
  CreatorProfile,
  Descriptor,
  Frame,
  GalleryItem,
  PlanKind,
  User,
} from '@/lib/types';
import { parseDescriptor } from '@/lib/descriptor';
import { isCampaignKind } from '@/lib/campaign-kinds';
import { supabaseBrowser } from '@/lib/supabase/client';
import { MEDIA_BUCKET, SITE_URL } from './config';
import type {
  Backend,
  CreateCampaignInput,
  Result,
  SignUpOutcome,
  UpdateProfilePatch,
} from './types';

/**
 * Implémentation réelle : Supabase Auth + Postgres + RLS + Storage.
 * Toute la sécurité repose sur les policies de `supabase/migrations/0001_init.sql`.
 */

type Row = Record<string, unknown>;

function rowToUser(row: Row): User {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    username: String(row.username ?? ''),
    org_name: (row.org_name as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    plan: (row.plan as User['plan']) ?? 'free',
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
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
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
    if (/rate limit/i.test(raw)) return 'Trop de tentatives. Réessayez dans un instant.';
    return raw;
  }
  return fallback;
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
  async signUpWithEmail(email, password): Promise<SignUpOutcome> {
    const sb = supabaseBrowser();
    const { data, error } = await sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=/onboarding` },
    });
    if (error) return { error: message(error, "L'inscription a échoué.") };
    return { needsEmailConfirmation: !data.session };
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

  async signInWithGoogle(): Promise<Result> {
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${SITE_URL}/auth/callback?next=/onboarding` },
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
    if (error) return { error: message(error, 'La création de la campagne a échoué.') };
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

    return campaigns.map((c) => ({
      ...c,
      frame: c.frame_id ? framesById.get(c.frame_id) ?? null : null,
      creator: creatorsById.get(c.owner_id) ?? null,
    }));
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
    };
  },

  /* --- Formule ------------------------------------------------------ */
  // Le changement de formule est une opération serveur : la fonction SQL
  // `set_own_plan` est le seul chemin, et elle sera réservée au webhook de
  // paiement en production (voir l'en-tête de la migration 0002).
  async setPlan(_userId, plan: PlanKind): Promise<Result> {
    const { error } = await supabaseBrowser().rpc('set_own_plan', { p_plan: plan });
    return error ? { error: message(error, 'Le changement de formule a échoué.') } : {};
  },

  /* --- Médias ------------------------------------------------------- */
  async uploadImage(file, folder): Promise<Result<string>> {
    const sb = supabaseBrowser();
    const { data } = await sb.auth.getUser();
    if (!data.user) return { error: 'Non connecté.' };

    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${data.user.id}/${folder}/${crypto.randomUUID()}.${ext}`;

    const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, file, {
      cacheControl: '31536000',
      upsert: false,
      contentType: file.type || 'image/png',
    });
    if (error) return { error: message(error, 'Le téléversement a échoué.') };

    const { data: pub } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return { data: pub.publicUrl };
  },
};
