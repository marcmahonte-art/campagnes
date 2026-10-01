import type {
  Campaign,
  CampaignKind,
  CampaignQuota,
  CampaignWithFrame,
  CreatorProfile,
  Descriptor,
  Frame,
  GalleryItem,
  ParticipationClaim,
  PlanKind,
  Ratio,
  User,
} from '@/lib/types';
import type { ReportReason } from '@/lib/reports';
import type { ShareEventType, ShareStats } from '@/lib/share';

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
  kind: CampaignKind;
}

export interface UpdateProfilePatch {
  username?: string;
  org_name?: string | null;
  logo_url?: string | null;
  onboarded_at?: string | null;
}

/** Signalement de contenu envoyé depuis la page publique `/signalement`. */
export interface ReportInput {
  reason: ReportReason;
  /** Adresse de la campagne visée. Facultative : on peut signaler sans lien. */
  campaignUrl: string;
  description: string;
  email: string;
  /** Chemin de la pièce jointe déjà téléversée, le cas échéant. */
  attachmentPath?: string | null;
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
  signUpWithEmail(email: string, password: string, username?: string): Promise<SignUpOutcome>;
  /** Renvoie l'email de confirmation d'inscription (aucun compte créé). */
  resendConfirmation(email: string): Promise<Result>;
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
        'name' | 'slug' | 'ratio' | 'kind' | 'status' | 'frame_id' | 'share_text' | 'share_hashtags'
      >
    >,
  ): Promise<Result>;
  deleteCampaign(campaignId: string): Promise<Result>;
  listSlugs(): Promise<string[]>;

  /* --- Quota de téléchargements --------------------------------------- */
  /**
   * Réserve un téléchargement pour un participant.
   *
   * Appelé au clic sur « Télécharger » : c'est le seul instant mesurable du
   * parcours participant. Un partage ne l'est pas — le participant peut copier
   * le lien sans que la plateforme le voie.
   *
   * `granted: false` signifie « quota atteint », **pas** « erreur ». Une panne
   * est renvoyée dans `Result.error`. L'écran de blocage dépend de cette
   * distinction : sans elle, il afficherait un message d'erreur technique au
   * moment où la campagne a simplement atteint sa limite.
   */
  claimParticipation(campaignId: string): Promise<Result<ParticipationClaim>>;

  /**
   * Quota lisible sans être le propriétaire — pour l'écran de blocage.
   *
   * N'expose ni nom, ni slug, ni propriétaire : le participant doit voir que
   * la limite est atteinte, pas qui est le créateur.
   */
  getCampaignQuota(campaignId: string): Promise<CampaignQuota | null>;

  /**
   * Prolonge une campagne de `downloads` téléchargements.
   *
   * Aucun paiement automatique n'existe : l'extension se demande par contact.
   * Cette fonction écrit donc un volume **déjà payé et validé hors du produit**,
   * et n'est appelée que depuis l'outil d'administration.
   */
  grantParticipation(campaignId: string, downloads: number): Promise<Result>;

  /* --- Galerie publique --------------------------------------------- */
  /** Toutes les campagnes publiées, tous créateurs confondus (§13). */
  listGallery(): Promise<GalleryItem[]>;

  /**
   * Une campagne publiée, par son slug — c'est l'entrée du parcours participant.
   * Renvoie `null` pour un brouillon : un lien partagé ne doit jamais révéler
   * l'existence d'une campagne non publiée.
   */
  getPublicCampaign(slug: string): Promise<GalleryItem | null>;

  /* --- Liens privés de distribution ---------------------------------- */
  /**
   * Crée un jeton de distribution privé rattaché à une campagne.
   *
   * Le quota du lien est **distinct** de celui de la campagne : un lien privé
   * sert à compter les téléchargements d'une diffusion précise (un client, un
   * événement), pas à prolonger la campagne entière. Ne jamais lui passer
   * `participants_granted` : les deux compteurs ne mesurent pas la même chose.
   *
   * L'écriture passe par une fonction SQL `security definer` — le navigateur
   * n'écrit jamais directement dans `distribution_links`.
   */
  createDistributionLink(
    campaignId: string,
    quota: number,
    expiresAt?: string | null,
  ): Promise<Result<string>>;

  /**
   * Résout un jeton privé vers sa campagne, **sans consommer de quota**.
   *
   * Ouvrir la page ne doit rien coûter : seule la réservation au moment du
   * téléchargement décompte une unité. Renvoie `null` pour un jeton inconnu,
   * expiré, révoqué ou épuisé — un lien mort doit être indiscernable d'un lien
   * inexistant.
   */
  getPrivateCampaign(token: string): Promise<GalleryItem | null>;

  /* --- Signalements de contenu -------------------------------------- */
  /**
   * Enregistre un signalement.
   *
   * L'appel passe par une fonction SQL `security definer` qui **revalide tout**
   * (motif, longueurs, format de l'email) et applique une limitation de
   * fréquence. La validation faite dans le navigateur n'est qu'un confort : elle
   * est contournable, elle ne protège rien.
   *
   * Aucun signalement n'est lisible depuis l'application : ils sont consultés
   * par l'équipe, jamais exposés au public ni au créateur visé.
   */
  submitReport(input: ReportInput): Promise<Result>;

  /**
   * Téléverse la pièce jointe d'un signalement, dans un espace **privé**.
   *
   * Distincte de `uploadImage` à dessein : celle-ci doit fonctionner sans
   * compte, puisque le signalement est ouvert à tous.
   */
  uploadReportAttachment(file: File): Promise<Result<string>>;

  /* --- Partage social ------------------------------------------------ */
  /**
   * Compte un partage. À appeler en « tir et oublie ».
   *
   * Un compteur en panne ne doit **jamais** empêcher un partage d'aboutir : le
   * geste utile est local (ouvrir WhatsApp, copier dans le presse-papiers) et
   * il a déjà eu lieu quand cette fonction est appelée. Son échec ne se montre
   * donc pas au participant — il n'y peut rien, et cela ne le concerne pas.
   */
  recordShareEvent(campaignId: string, eventType: ShareEventType): Promise<Result>;

  /**
   * Partages par campagne, pour l'écran Analytics.
   *
   * Une campagne sans aucun partage est **absente** du résultat : l'appelant
   * affiche zéro, il ne lit pas un objet vide. Renvoyer une entrée à zéro pour
   * chaque campagne laisserait croire à une mesure, alors que rien n'a été
   * mesuré.
   */
  getShareStats(campaignIds: string[]): Promise<Record<string, ShareStats>>;

  /* --- Formule ------------------------------------------------------ */
  /** Change la formule du compte. En mode Supabase, l'activation passe par un contact. */
  setPlan(userId: string, plan: PlanKind): Promise<Result>;

  /* --- Médias ------------------------------------------------------- */
  uploadImage(file: File, folder: string): Promise<Result<string>>;
}
