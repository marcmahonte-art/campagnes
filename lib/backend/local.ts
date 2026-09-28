import type {
  Campaign,
  CampaignWithFrame,
  CreatorProfile,
  Descriptor,
  Frame,
  User,
} from '@/lib/types';
import { createDescriptor } from '@/lib/descriptor';
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

function readDb(): Db {
  if (typeof window === 'undefined') return emptyDb();
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as Partial<Db>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      frames: Array.isArray(parsed.frames) ? parsed.frames : [],
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
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
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      org_name: user.org_name,
      logo_url: user.logo_url,
      created_at: user.created_at,
    };
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
