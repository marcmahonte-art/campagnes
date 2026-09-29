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
import type {
  Backend,
  CreateCampaignInput,
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

interface Db {
  users: DbUser[];
  frames: Frame[];
  campaigns: Campaign[];
}

function emptyDb(): Db {
  return { users: [], frames: [], campaigns: [] };
}

/** Les campagnes antérieures à la colonne `kind` sont des campagnes photo. */
function withKind(campaign: Campaign): Campaign {
  return isCampaignKind(campaign.kind) ? campaign : { ...campaign, kind: 'photo_frame' };
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
      campaigns: Array.isArray(parsed.campaigns)
        ? parsed.campaigns.map((c) => withKind(c))
        : [],
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
  async signUpWithEmail(email, password): Promise<SignUpOutcome> {
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

    const base = normalized.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 20) || 'createur';
    let username = base;
    let n = 1;
    while (db.users.some((u) => u.username === username)) {
      n += 1;
      username = `${base}${n}`;
    }

    const user: DbUser = {
      id: uid(),
      email: normalized,
      username,
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
    writeDb({
      users: db.users.filter((u) => u.id !== id),
      frames: db.frames.filter((f) => f.owner_id !== id),
      campaigns: db.campaigns.filter((c) => c.owner_id !== id),
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

  /* --- Galerie publique --------------------------------------------- */
  async listGallery(): Promise<GalleryItem[]> {
    const db = readDb();
    return db.campaigns
      .filter((c) => c.status === 'published')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((c) => {
        const owner = db.users.find((u) => u.id === c.owner_id);
        return {
          ...c,
          frame: db.frames.find((f) => f.id === c.frame_id) ?? null,
          creator: owner ? publicCreator(owner) : null,
        };
      });
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
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
  };

  writeDb({
    users: [...db.users, user],
    frames: [...db.frames, verticalFrame, squareFrame],
    campaigns: [...db.campaigns, published, draft],
  });
  writeSession(userId);

  return publicUser(user);
}

