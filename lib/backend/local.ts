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
import { createDescriptor } from '@/lib/descriptor';
import { isCampaignKind } from '@/lib/campaign-kinds';
import { FREE_DOWNLOADS, toQuota } from '@/lib/quota';
import { SHARE_EVENTS, type ShareEventType, type ShareStats } from '@/lib/share';
import type {
  Backend,
  CreateCampaignInput,
  DistributionLink,
  Result,
  SignUpOutcome,
  UpdateProfilePatch,
} from './types';

/**
 * MODE LOCAL DE DÉMONSTRATION
 * ---------------------------
 * Mêmes signatures que l'implémentation Supabase, persistance dans le navigateur.
 * Il sert à parcourir tout le parcours Phase A sans provisionner de projet, et à
 * valider le Frame Engine et le descripteur JSON.
 *
 * Ce n'est PAS une couche de sécurité : les mots de passe sont stockés en clair
 * dans le localStorage. Le mode Supabase est la seule cible de production.
 */

const DB_KEY = 'campagnes.db.v1';
const SESSION_KEY = 'campagnes.session.v1';

interface DbUser extends User {
  password: string;
}

/** Un partage compté, en mode démonstration. Même forme que `campaign_events`. */
interface DbShareEvent {
  campaign_id: string;
  event_type: ShareEventType;
  created_at: string;
}

/** Un like posé, en mode démonstration. Même forme que `campaign_likes`. */
interface DbLike {
  campaign_id: string;
  user_id: string;
  created_at: string;
}

/** Nombre de likes d'une campagne. `likes` est optionnel : une base d'avant 0012. */
function countLikes(db: Db, campaignId: string): number {
  return (db.likes ?? []).filter((l) => l.campaign_id === campaignId).length;
}

/** L'utilisateur a-t-il aimé cette campagne ? */
function hasLiked(db: Db, campaignId: string, userId: string): boolean {
  return (db.likes ?? []).some(
    (l) => l.campaign_id === campaignId && l.user_id === userId,
  );
}

interface Db {
  users: DbUser[];
  frames: Frame[];
  campaigns: Campaign[];
  /**
   * Compteurs de partage. Optionnel à la lecture : une base écrite avant la
   * migration 0011 n'a pas ce champ, et ce n'est pas une raison pour la jeter.
   */
  shareEvents?: DbShareEvent[];
  /**
   * Likes posés. Optionnel à la lecture, comme `shareEvents` : une base
   * écrite avant la migration 0012 n'a pas ce champ, et ce n'est pas une
   * raison de jeter les campagnes qu'elle contient.
   */
  likes?: DbLike[];
}

function emptyDb(): Db {
  return { users: [], frames: [], campaigns: [], shareEvents: [], likes: [] };
}

/**
 * Complète une campagne lue depuis le localStorage.
 *
 * Le navigateur peut contenir des campagnes écrites avant `kind` (0004) et
 * avant le quota (0005). On ne rejette rien : on remplit les champs manquants
 * avec les mêmes valeurs par défaut que la base, pour que le mode local et le
 * mode Supabase se comportent identiquement.
 */
function normalize(campaign: Campaign): Campaign {
  return {
    ...campaign,
    kind: isCampaignKind(campaign.kind) ? campaign.kind : 'photo_frame',
    participants_used: Number.isFinite(campaign.participants_used)
      ? campaign.participants_used
      : 0,
    participants_granted: Number.isFinite(campaign.participants_granted)
      ? campaign.participants_granted
      : FREE_DOWNLOADS,
  };
}

function readDb(): Db {
  if (typeof window === 'undefined') return emptyDb();
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as Partial<Db>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      frames: Array.isArray(parsed.frames) ? parsed.frames : [],
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns.map(normalize) : [],
      shareEvents: Array.isArray(parsed.shareEvents) ? parsed.shareEvents : [],
      likes: Array.isArray(parsed.likes) ? parsed.likes : [],
    };
  } catch {
    return emptyDb();
  }
}

function writeDb(db: Db): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function readSession(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SESSION_KEY);
}

function writeSession(userId: string | null): void {
  if (typeof window === 'undefined') return;
  if (userId) window.localStorage.setItem(SESSION_KEY, userId);
  else window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event('campagnes:auth'));
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function publicUser(u: DbUser): User {
  const { password: _password, ...rest } = u;
  return rest;
}

/** Projection publique : jamais l'email, jamais la formule — seulement son effet visible. */
function publicCreator(u: DbUser): CreatorProfile {
  return {
    id: u.id,
    username: u.username,
    org_name: u.org_name,
    logo_url: u.logo_url,
    created_at: u.created_at,
    watermark: u.plan === 'free',
  };
}

const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms));

export const localBackend: Backend = {
  mode: 'local',

  /* --- Session ------------------------------------------------------ */
  async getSessionUser() {
    const id = readSession();
    if (!id) return null;
    const user = readDb().users.find((u) => u.id === id);
    return user ? publicUser(user) : null;
  },

  onAuthStateChange(cb) {
    if (typeof window === 'undefined') return () => {};
    const handler = () => {
      void this.getSessionUser().then(cb);
    };
    window.addEventListener('campagnes:auth', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('campagnes:auth', handler);
      window.removeEventListener('storage', handler);
    };
  },

  /* --- Authentification --------------------------------------------- */
  async signUpWithEmail(email, password, username): Promise<SignUpOutcome> {
    await delay();
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { error: "L'adresse email n'est pas valide." };
    }
    if (password.length < 8) {
      return { error: 'Le mot de passe doit contenir au moins 8 caractères.' };
    }

    const db = readDb();
    if (db.users.some((u) => u.email === normalized)) {
      return { error: 'Un compte existe déjà avec cette adresse.' };
    }

    const rawName = (username ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const base = rawName.length >= 3 ? rawName.slice(0, 28) : (normalized.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 20) || 'createur');
    let finalUsername = base;
    let n = 1;
    while (db.users.some((u) => u.username === finalUsername)) {
      n += 1;
      finalUsername = `${base}${n}`;
    }

    const user: DbUser = {
      id: uid(),
      email: normalized,
      username: finalUsername,
      org_name: null,
      logo_url: null,
      plan: 'free',
      onboarded_at: null,
      created_at: new Date().toISOString(),
      password,
    };

    db.users.push(user);
    writeDb(db);
    writeSession(user.id);
    return {};
  },

  /**
   * Sans projet Supabase, aucune confirmation n'est envoyée : l'inscription est
   * immédiate. L'écran de confirmation ne doit donc jamais s'afficher ici, et
   * cette méthode n'est qu'un garde-fou.
   */
  async resendConfirmation(): Promise<Result> {
    await delay();
    return {
      error:
        "Aucun email de confirmation n'est envoyé en mode démonstration : l'inscription est immédiate.",
    };
  },

  async signInWithEmail(email, password): Promise<Result> {
    await delay();
    const normalized = email.trim().toLowerCase();
    const db = readDb();
    const user = db.users.find((u) => u.email === normalized);
    if (!user || user.password !== password) {
      return { error: 'Email ou mot de passe incorrect.' };
    }
    writeSession(user.id);
    return {};
  },

  async signInWithGoogle(): Promise<Result> {
    return {
      error:
        "La connexion Google nécessite un projet Supabase configuré. En mode démonstration, utilisez l'inscription par email.",
    };
  },

  async signOut(): Promise<void> {
    writeSession(null);
  },

  /* --- Profil ------------------------------------------------------- */
  async getProfile(userId) {
    const user = readDb().users.find((u) => u.id === userId);
    return user ? publicUser(user) : null;
  },

  async updateProfile(userId, patch: UpdateProfilePatch): Promise<Result> {
    await delay(120);
    const db = readDb();
    const index = db.users.findIndex((u) => u.id === userId);
    if (index === -1) return { error: 'Profil introuvable.' };

    if (patch.username) {
      const taken = db.users.some((u) => u.username === patch.username && u.id !== userId);
      if (taken) return { error: 'Ce nom d’utilisateur est déjà pris.' };
    }

    db.users[index] = { ...db.users[index], ...patch };
    writeDb(db);
    window.dispatchEvent(new Event('campagnes:auth'));
    return {};
  },

  async updateEmail(email): Promise<Result> {
    await delay(120);
    const id = readSession();
    if (!id) return { error: 'Non connecté.' };
    const normalized = email.trim().toLowerCase();
    const db = readDb();
    if (db.users.some((u) => u.email === normalized && u.id !== id)) {
      return { error: 'Cette adresse est déjà utilisée.' };
    }
    const index = db.users.findIndex((u) => u.id === id);
    db.users[index] = { ...db.users[index], email: normalized };
    writeDb(db);
    window.dispatchEvent(new Event('campagnes:auth'));
    return {};
  },

  async updatePassword(password): Promise<Result> {
    await delay(120);
    if (password.length < 8) return { error: 'Le mot de passe doit contenir au moins 8 caractères.' };
    const id = readSession();
    if (!id) return { error: 'Non connecté.' };
    const db = readDb();
    const index = db.users.findIndex((u) => u.id === id);
    db.users[index] = { ...db.users[index], password };
    writeDb(db);
    return {};
  },

  async deleteAccount(): Promise<Result> {
    await delay(120);
    const id = readSession();
    if (!id) return { error: 'Non connecté.' };
    const db = readDb();
    const campaigns = db.campaigns.filter((c) => c.owner_id !== id);
    // Les compteurs suivent la campagne : un événement orphelin n'a plus rien à
    // mesurer, et le laisser grossir indéfiniment serait une fuite silencieuse.
    const kept = new Set(campaigns.map((c) => c.id));
    writeDb({
      users: db.users.filter((u) => u.id !== id),
      frames: db.frames.filter((f) => f.owner_id !== id),
      campaigns,
      shareEvents: (db.shareEvents ?? []).filter((e) => kept.has(e.campaign_id)),
    });
    writeSession(null);
    return {};
  },

  async isUsernameAvailable(username) {
    return !readDb().users.some((u) => u.username === username);
  },

  async getCreatorProfile(username): Promise<CreatorProfile | null> {
    const user = readDb().users.find((u) => u.username === username);
    return user ? publicCreator(user) : null;
  },

  /* --- Cadres ------------------------------------------------------- */
  async createFrame(ownerId, name, descriptor): Promise<Result<Frame>> {
    const db = readDb();
    const frame: Frame = {
      id: uid(),
      owner_id: ownerId,
      name,
      descriptor_json: descriptor,
      thumbnail_url: null,
      created_at: new Date().toISOString(),
    };
    db.frames.push(frame);
    writeDb(db);
    return { data: frame };
  },

  async saveFrame(frameId, descriptor, thumbnailUrl): Promise<Result> {
    const db = readDb();
    const index = db.frames.findIndex((f) => f.id === frameId);
    if (index === -1) return { error: 'Cadre introuvable.' };
    db.frames[index] = {
      ...db.frames[index],
      descriptor_json: descriptor,
      thumbnail_url: thumbnailUrl ?? db.frames[index].thumbnail_url,
    };
    writeDb(db);
    return {};
  },

  async getFrame(frameId) {
    return readDb().frames.find((f) => f.id === frameId) ?? null;
  },

  /* --- Campagnes ---------------------------------------------------- */
  async listCampaigns(ownerId): Promise<CampaignWithFrame[]> {
    const db = readDb();
    return db.campaigns
      .filter((c) => c.owner_id === ownerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((c) => ({ ...c, frame: db.frames.find((f) => f.id === c.frame_id) ?? null }));
  },

  async listPublishedCampaigns(ownerId): Promise<CampaignWithFrame[]> {
    const all = await this.listCampaigns(ownerId);
    return all.filter((c) => c.status === 'published');
  },

  async getCampaign(campaignId): Promise<CampaignWithFrame | null> {
    const db = readDb();
    const campaign = db.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return null;
    return { ...campaign, frame: db.frames.find((f) => f.id === campaign.frame_id) ?? null };
  },

  async createCampaign(input: CreateCampaignInput): Promise<Result<Campaign>> {
    const db = readDb();
    if (db.campaigns.some((c) => c.slug === input.slug)) {
      return { error: 'Ce slug est déjà utilisé.' };
    }
    const campaign: Campaign = {
      id: uid(),
      owner_id: input.ownerId,
      name: input.name,
      slug: input.slug,
      frame_id: null,
      ratio: input.ratio,
      kind: input.kind,
      status: 'draft',
      participants_used: 0,
      // Toute campagne naît avec le quota offert. Aucune logique de création
      // n'est nécessaire : c'est la valeur par défaut de la migration 0005,
      // et le mode local la reproduit exactement.
      participants_granted: FREE_DOWNLOADS,
      created_at: new Date().toISOString(),
    };
    db.campaigns.push(campaign);
    writeDb(db);
    return { data: campaign };
  },

  async updateCampaign(campaignId, patch): Promise<Result> {
    const db = readDb();
    const index = db.campaigns.findIndex((c) => c.id === campaignId);
    if (index === -1) return { error: 'Campagne introuvable.' };
    if (patch.slug && db.campaigns.some((c) => c.slug === patch.slug && c.id !== campaignId)) {
      return { error: 'Ce slug est déjà utilisé.' };
    }
    db.campaigns[index] = { ...db.campaigns[index], ...patch };
    writeDb(db);
    return {};
  },

  async deleteCampaign(campaignId): Promise<Result> {
    const db = readDb();
    writeDb({ ...db, campaigns: db.campaigns.filter((c) => c.id !== campaignId) });
    return {};
  },

  async listSlugs() {
    return readDb().campaigns.map((c) => c.slug);
  },

  /* --- Quota de téléchargements --------------------------------------- */
  /**
   * Même contrat que l'implémentation Supabase, y compris l'atomicité : ici elle
   * est gratuite puisque tout est dans un seul onglet. Le refus est renvoyé
   * dans `data`, jamais dans `error` — l'écran de blocage dépend de cette
   * distinction.
   */
  async claimParticipation(campaignId) {
    const db = readDb();
    const index = db.campaigns.findIndex((c) => c.id === campaignId);
    if (index === -1) return { error: 'Campagne introuvable.' };

    const campaign = db.campaigns[index];
    // Une campagne non publiée ou sans cadre n'a rien à réserver.
    if (campaign.status !== 'published' || !campaign.frame_id) {
      return { data: { granted: false, used: campaign.participants_used, quota: campaign.participants_granted } };
    }

    if (campaign.participants_used >= campaign.participants_granted) {
      return {
        data: {
          granted: false,
          used: campaign.participants_used,
          quota: campaign.participants_granted,
        },
      };
    }

    db.campaigns[index] = { ...campaign, participants_used: campaign.participants_used + 1 };
    writeDb(db);
    return {
      data: {
        granted: true,
        used: db.campaigns[index].participants_used,
        quota: db.campaigns[index].participants_granted,
      },
    };
  },

  async getCampaignQuota(campaignId) {
    const campaign = readDb().campaigns.find((c) => c.id === campaignId);
    if (!campaign) return null;
    return toQuota(campaign.participants_used, campaign.participants_granted);
  },

  async grantParticipation(campaignId, downloads) {
    const db = readDb();
    const index = db.campaigns.findIndex((c) => c.id === campaignId);
    if (index === -1) return { error: 'Campagne introuvable.' };
    db.campaigns[index] = {
      ...db.campaigns[index],
      participants_granted: db.campaigns[index].participants_granted + downloads,
    };
    writeDb(db);
    return {};
  },

  /* --- Galerie publique --------------------------------------------- */
  async listGallery(): Promise<GalleryItem[]> {
    const db = readDb();
    const me = readSession();
    return db.campaigns
      .filter((c) => c.status === 'published')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((c) => {
        const owner = db.users.find((u) => u.id === c.owner_id);
        return {
          ...c,
          frame: db.frames.find((f) => f.id === c.frame_id) ?? null,
          creator: owner ? publicCreator(owner) : null,
          // Même règle que le mode Supabase : une utilisation est un
          // téléchargement, et un téléchargement est déjà compté par le quota.
          usageCount: c.participants_used ?? 0,
          likesCount: countLikes(db, c.id),
          likedByMe: me ? hasLiked(db, c.id, me) : false,
        };
      });
  },

  /**
   * Ajoute ou retire le like du visiteur courant.
   *
   * Même refus que la base : sans session, l'appel échoue. Une démonstration
   * qui laisserait aimer sans compte montrerait un comportement que la
   * production refuse — et l'utilisateur le découvrirait en passant en vrai.
   */
  async toggleCampaignLike(campaignId) {
    await delay();
    const me = readSession();
    if (!me) return { error: 'Connectez-vous pour aimer cette campagne.' };

    const db = readDb();
    const campaign = db.campaigns.find((c) => c.id === campaignId && c.status === 'published');
    if (!campaign) return { error: 'Campagne introuvable.' };

    const liked = hasLiked(db, campaignId, me);
    const mine = db.likes ?? [];
    const rest = liked
      ? mine.filter((l) => !(l.campaign_id === campaignId && l.user_id === me))
      : [...mine, { campaign_id: campaignId, user_id: me, created_at: new Date().toISOString() }];

    writeDb({ ...db, likes: rest });

    return {
      data: { liked: !liked, likesCount: countLikes({ ...db, likes: rest }, campaignId) },
    };
  },

  /**
   * Entrée du parcours participant. Un brouillon est traité comme inexistant :
   * le lien ne doit rien laisser filtrer sur les campagnes non publiées.
   */
  async getPublicCampaign(slug): Promise<GalleryItem | null> {
    const db = readDb();
    const campaign = db.campaigns.find((c) => c.slug === slug && c.status === 'published');
    if (!campaign) return null;

    const owner = db.users.find((u) => u.id === campaign.owner_id);
    return {
      ...campaign,
      frame: db.frames.find((f) => f.id === campaign.frame_id) ?? null,
      creator: owner ? publicCreator(owner) : null,
    };
  },

  /* --- Liens privés de distribution --------------------------------- */
  /**
   * Le mode démonstration ne stocke aucun jeton de distribution : ni table, ni
   * entrée prévue dans `localStorage`. On le dit franchement plutôt que de
   * renvoyer un jeton que rien ne saurait ensuite résoudre.
   */
  async createDistributionLink(_campaignId, _quota, _expiresAt): Promise<Result<string>> {
    return { error: 'Les liens privés ne sont pas disponibles en mode démonstration.' };
  },

  /**
   * Renvoie toujours une liste vide, et c'est exact.
   *
   * Le mode démonstration ne crée aucun jeton : il n'y en a donc aucun à
   * relire. Dire `[]` plutôt qu'une erreur laisse la page s'afficher dans son
   * état « aucun lien », qui est le vrai état de cette base de démonstration —
   * l'alternative, un message d'échec, laisserait croire à une panne.
   */
  async listDistributionLinks(_campaignId): Promise<Result<DistributionLink[]>> {
    return { data: [] };
  },

  async getPrivateCampaign(_token): Promise<GalleryItem | null> {
    return null;
  },

  /* --- Signalements de contenu -------------------------------------- */
  /**
   * Le mode démonstration n'a ni table de signalements ni espace de stockage
   * privé. On le dit, plutôt que de laisser croire à un envoi qui ne mènerait
   * nulle part : un signalement perdu en silence est le pire des cas, parce que
   * la personne croit avoir agi.
   */
  async submitReport(_input): Promise<Result> {
    return { error: 'Les signalements ne sont pas disponibles en mode démonstration.' };
  },

  async uploadReportAttachment(_file): Promise<Result<string>> {
    return { error: 'Les signalements ne sont pas disponibles en mode démonstration.' };
  },

  /* --- Partage social ------------------------------------------------ */
  /**
   * Même règle qu'en base : le type est revalidé, et un brouillon ne reçoit
   * aucun événement. La revalidation n'est pas une ceinture de sécurité ici —
   * c'est ce qui garantit que les deux implémentations comptent la même chose,
   * et donc que le mode démonstration dit la vérité sur le mode réel.
   */
  async recordShareEvent(campaignId, eventType): Promise<Result> {
    if (!(SHARE_EVENTS as readonly string[]).includes(eventType)) {
      return { error: "Type d'événement inconnu." };
    }

    const db = readDb();
    const campaign = db.campaigns.find((c) => c.id === campaignId);
    if (!campaign || campaign.status !== 'published') return {};

    db.shareEvents = [
      ...(db.shareEvents ?? []),
      { campaign_id: campaignId, event_type: eventType, created_at: new Date().toISOString() },
    ];
    writeDb(db);
    return {};
  },

  async getShareStats(campaignIds): Promise<Record<string, ShareStats>> {
    const wanted = new Set(campaignIds);
    const out: Record<string, ShareStats> = {};

    for (const event of readDb().shareEvents ?? []) {
      if (!wanted.has(event.campaign_id)) continue;
      const stats = out[event.campaign_id] ?? { total: 0, whatsapp: 0, facebook: 0, tiktok: 0 };
      stats.total += 1;
      if (event.event_type === 'share_whatsapp') stats.whatsapp += 1;
      else if (event.event_type === 'share_facebook') stats.facebook += 1;
      else if (event.event_type === 'share_tiktok') stats.tiktok += 1;
      out[event.campaign_id] = stats;
    }

    return out;
  },

  /* --- Formule ------------------------------------------------------ */
  async setPlan(userId, plan: PlanKind): Promise<Result> {
    await delay(200);
    const db = readDb();
    const index = db.users.findIndex((u) => u.id === userId);
    if (index === -1) return { error: 'Profil introuvable.' };
    db.users[index] = { ...db.users[index], plan };
    writeDb(db);
    window.dispatchEvent(new Event('campagnes:auth'));
    return {};
  },

  /* --- Médias ------------------------------------------------------- */
  async uploadImage(file): Promise<Result<string>> {
    // En mode démonstration, l'image est encodée en data URL : aucune dépendance
    // à un stockage distant, et le descripteur reste rejouable.
    if (file.size > 4 * 1024 * 1024) {
      return { error: 'Image trop lourde pour le mode démonstration (4 Mo maximum).' };
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ data: String(reader.result) });
      reader.onerror = () => resolve({ error: "Impossible de lire l'image." });
      reader.readAsDataURL(file);
    });
  },
};

export { createDescriptor };

/* ------------------------------------------------------------------ */
/* Compte de démonstration                                             */
/* ------------------------------------------------------------------ */

/**
 * Identifiants du compte de démonstration.
 * Ce ne sont PAS des identifiants de production : en mode démonstration, tout vit
 * dans le navigateur et n'importe qui peut lire le localStorage. Le bouton
 * « Entrer dans la démonstration » crée ce compte à la volée côté client.
 */
export const DEMO_EMAIL = 'demo@campagnes.app';
export const DEMO_PASSWORD = 'campagnes2026';

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

/** Bandeau noir de pied de cadre — la couleur de marque, pas de dégradé. */
const BAND_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="360" viewBox="0 0 1080 360">
  <rect width="1080" height="360" fill="#000000"/>
</svg>`);

/** Coin noir, pour la campagne au format carré. */
const CORNER_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <path d="M0 0 H430 V430 Z" fill="#000000"/>
</svg>`);

/**
 * Zone photo du cadre « sur fond » : un simple liseré blanc. Le parcours
 * participant pose la photo pile au-dessus et la masque dans cette fenêtre,
 * le décor reste visible tout autour.
 */
const ZONE_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="880" height="700" viewBox="0 0 880 700">
  <rect x="14" y="14" width="852" height="672" rx="18" fill="none" stroke="#FFFFFF" stroke-width="28"/>
</svg>`);

const VERTICAL_THUMB = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#F3F4F6"/>
  <rect y="1560" width="1080" height="360" fill="#000000"/>
  <text x="540" y="1700" font-family="Inter, Helvetica, sans-serif" font-size="104"
        font-weight="700" fill="#FFFFFF" text-anchor="middle">Rentrée 2026</text>
  <text x="540" y="1800" font-family="Inter, Helvetica, sans-serif" font-size="46"
        fill="#9CA3AF" text-anchor="middle">@amicale-abidjan</text>
</svg>`);

const SQUARE_THUMB = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="#F3F4F6"/>
  <path d="M0 0 H430 V430 Z" fill="#000000"/>
  <text x="540" y="960" font-family="Inter, Helvetica, sans-serif" font-size="92"
        font-weight="700" fill="#000000" text-anchor="middle">Semaine de la santé</text>
</svg>`);

/**
 * Crée (une seule fois) un compte de démonstration complet : profil, deux cadres
 * et deux campagnes — une publiée, un brouillon. Idempotent : si le compte existe
 * déjà, on se contente de reconnecter.
 */
export async function seedDemoAccount(): Promise<User> {
  const db = readDb();
  const existing = db.users.find((u) => u.email === DEMO_EMAIL);

  if (existing) {
    writeSession(existing.id);
    return publicUser(existing);
  }

  const now = new Date().toISOString();
  const userId = uid();

  const user: DbUser = {
    id: userId,
    email: DEMO_EMAIL,
    username: 'demo',
    org_name: "Amicale des étudiants d'Abidjan",
    logo_url: null,
    // Le compte de démonstration arrive en Creator : c'est ce qui permet de voir
    // les modules premium (Motion, Analytics, QR) sans rien payer.
    plan: 'creator',
    onboarded_at: now,
    created_at: now,
    password: DEMO_PASSWORD,
  };

  const verticalFrame: Frame = {
    id: uid(),
    owner_id: userId,
    name: 'Cadre — Rentrée 2026',
    descriptor_json: {
      version: 1,
      ratio: '9:16',
      background: 'transparent',
      layers: [
        {
          id: 'demo-band',
          type: 'image',
          src: BAND_SVG,
          label: 'bandeau.png',
          x: 0,
          y: 1560,
          w: 1080,
          h: 360,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        {
          id: 'demo-title',
          type: 'text',
          text: 'Rentrée 2026',
          font: 'Inter',
          size: 110,
          color: '#FFFFFF',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 0,
          lineHeight: 1.16,
          curve: 0,
          x: 90,
          y: 1640,
          w: 900,
          h: 140,
          rotation: 0,
          z: 20,
          opacity: 1,
        },
        {
          id: 'demo-handle',
          type: 'text',
          text: '@amicale-abidjan',
          font: 'Inter',
          size: 48,
          color: '#9CA3AF',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 0,
          lineHeight: 1.16,
          curve: 0,
          x: 90,
          y: 1790,
          w: 900,
          h: 62,
          rotation: 0,
          z: 30,
          opacity: 1,
        },
      ],
    },
    thumbnail_url: VERTICAL_THUMB,
    created_at: now,
  };

  const squareFrame: Frame = {
    id: uid(),
    owner_id: userId,
    name: 'Cadre — Semaine de la santé',
    descriptor_json: {
      version: 1,
      ratio: '1:1',
      background: 'transparent',
      photo_anchor: 'demo-zone',
      layers: [
        {
          id: 'demo-corner',
          type: 'image',
          src: CORNER_SVG,
          label: 'coin.png',
          x: 0,
          y: 0,
          w: 430,
          h: 430,
          rotation: 0,
          z: 10,
          opacity: 1,
        },
        {
          id: 'demo-zone',
          type: 'image',
          src: ZONE_SVG,
          label: 'zone.png',
          x: 100,
          y: 190,
          w: 880,
          h: 700,
          rotation: 0,
          z: 15,
          opacity: 1,
        },
        {
          id: 'demo-square-title',
          type: 'text',
          text: 'Semaine de la santé',
          font: 'Inter',
          size: 92,
          color: '#000000',
          align: 'center',
          weight: 'normal',
          style: 'normal',
          letterSpacing: 0,
          lineHeight: 1.16,
          curve: 0,
          x: 90,
          y: 900,
          w: 900,
          h: 120,
          rotation: 0,
          z: 20,
          opacity: 1,
        },
      ],
    },
    thumbnail_url: SQUARE_THUMB,
    created_at: now,
  };

  const published: Campaign = {
    id: uid(),
    owner_id: userId,
    name: 'Rentrée 2026 — UFHB',
    slug: 'rentree-2026-ufhb',
    frame_id: verticalFrame.id,
    ratio: '9:16',
    kind: 'photo_frame',
    status: 'published',
    // Le quota offert, avec quelques participations déjà consommées : la démo doit
    // montrer l'encart de compteur dans un état réaliste, pas toujours à zéro.
    participants_used: 4,
    participants_granted: FREE_DOWNLOADS,
    created_at: now,
  };

  const draft: Campaign = {
    id: uid(),
    owner_id: userId,
    name: 'Semaine de la santé',
    slug: 'semaine-de-la-sante',
    frame_id: squareFrame.id,
    ratio: '1:1',
    kind: 'background_frame',
    status: 'draft',
    participants_used: 0,
    participants_granted: FREE_DOWNLOADS,
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
  };

  writeDb({
    users: [...db.users, user],
    frames: [...db.frames, verticalFrame, squareFrame],
    campaigns: [...db.campaigns, published, draft],
    shareEvents: db.shareEvents ?? [],
  });
  writeSession(userId);

  return publicUser(user);
}

