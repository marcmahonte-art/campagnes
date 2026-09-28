import type {
  Campaign,
  CampaignWithFrame,
  CreditTransaction,
  CreatorProfile,
  Descriptor,
  Frame,
  GalleryItem,
  PlanKind,
  Ratio,
  User,
} from '@/lib/types';

export type BackendMode = 'supabase' | 'local';

export interface Result<T = void> {
  data?: T;
  error?: string;
}

export interface SignUpOutcome {
  /** Inscription acceptée, mais Supabase attend la confirmation de l'email. */
  needsEmailConfirmation?: boolean;
  error?: string;
}

export interface CreateCampaignInput {
  ownerId: string;
  name: string;
  slug: string;
  ratio: Ratio;
}

export interface UpdateProfilePatch {
  username?: string;
  org_name?: string | null;
  logo_url?: string | null;
  onboarded_at?: string | null;
}

/**
 * Contrat unique de la couche données.
 * Deux implémentations : Supabase (réelle) et locale (démonstration).
 * Les écrans n'appellent que cette interface.
 */
export interface Backend {
  readonly mode: BackendMode;

  /* --- Session ------------------------------------------------------ */
  getSessionUser(): Promise<User | null>;
  onAuthStateChange(cb: (user: User | null) => void): () => void;

  /* --- Authentification créateur ------------------------------------ */
  signUpWithEmail(email: string, password: string): Promise<SignUpOutcome>;
  signInWithEmail(email: string, password: string): Promise<Result>;
  signInWithGoogle(): Promise<Result>;
  signOut(): Promise<void>;

  /* --- Profil ------------------------------------------------------- */
  getProfile(userId: string): Promise<User | null>;
  updateProfile(userId: string, patch: UpdateProfilePatch): Promise<Result>;
  updateEmail(email: string): Promise<Result>;
  updatePassword(password: string): Promise<Result>;
  deleteAccount(): Promise<Result>;
  isUsernameAvailable(username: string): Promise<boolean>;
  getCreatorProfile(username: string): Promise<CreatorProfile | null>;

  /* --- Cadres ------------------------------------------------------- */
  createFrame(ownerId: string, name: string, descriptor: Descriptor): Promise<Result<Frame>>;
  saveFrame(frameId: string, descriptor: Descriptor, thumbnailUrl?: string | null): Promise<Result>;
  getFrame(frameId: string): Promise<Frame | null>;

  /* --- Campagnes ---------------------------------------------------- */
  listCampaigns(ownerId: string): Promise<CampaignWithFrame[]>;
  listPublishedCampaigns(ownerId: string): Promise<CampaignWithFrame[]>;
  getCampaign(campaignId: string): Promise<CampaignWithFrame | null>;
  createCampaign(input: CreateCampaignInput): Promise<Result<Campaign>>;
  updateCampaign(
    campaignId: string,
    patch: Partial<
      Pick<
        Campaign,
        'name' | 'slug' | 'ratio' | 'status' | 'frame_id' | 'distribution_budget'
      >
    >,
  ): Promise<Result>;
  deleteCampaign(campaignId: string): Promise<Result>;
  listSlugs(): Promise<string[]>;

  /* --- Galerie publique --------------------------------------------- */
  /** Toutes les campagnes publiées, tous créateurs confondus (§13). */
  listGallery(): Promise<GalleryItem[]>;

  /* --- Abonnement et distribution ----------------------------------- */
  /** Change le plan du compte (activation immédiate en démonstration). */
  setPlan(userId: string, plan: PlanKind): Promise<Result>;
  listCreditTransactions(userId: string): Promise<CreditTransaction[]>;
  /** Achat d'un pack de distribution. Crédite le solde et journalise l'opération. */
  purchasePack(userId: string, packId: string): Promise<Result<{ credits: number }>>;
  /** Dotation de bienvenue du plan Free (idempotente). */
  grantFreeQuota(userId: string): Promise<Result<{ credits: number }>>;
  /**
   * Consomme un crédit quand un participant aboutit réellement (visuel créé),
   * jamais à la simple ouverture du lien (§11 du document).
   */
  consumeParticipation(campaignId: string, count?: number): Promise<Result<{ remaining: number }>>;

  /* --- Médias ------------------------------------------------------- */
  uploadImage(file: File, folder: string): Promise<Result<string>>;
}
