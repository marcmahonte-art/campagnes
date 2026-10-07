/**
 * Client d'intégration PawaPay (Merchant API v2).
 *
 * Documentation officielle : https://docs.pawapay.io/v2/docs/how_to_start
 *
 * Utilise le mode Hosted Payment Page (/v2/paymentpage) pour permettre aux utilisateurs
 * de payer par Mobile Money dans une interface optimisée et sécurisée.
 *
 * Marché cible : Burkina Faso — deux opérateurs, `ORANGE_BFA` et `MOOV_BFA`.
 * La passerelle en sait d'autres, mais les annoncer ici promettrait un moyen de
 * paiement qui ne fonctionne pas pour l'utilisateur.
 */

const PAWAPAY_SANDBOX_URL = 'https://api.sandbox.pawapay.io';
const PAWAPAY_PRODUCTION_URL = 'https://api.pawapay.io';

/**
 * URL de base de l'API pawaPay.
 *
 * Le choix de l'environnement ne doit **jamais** être implicite.
 *
 * Le défaut précédent — « sandbox si la variable est absente » — est un piège
 * silencieux : un déploiement en production qui oublie `PAWAPAY_BASE_URL`
 * accepte de vrais paiements, affiche une page de paiement qui fonctionne, puis
 * n'active aucune formule parce que les dépôts vont dans le bac à sable. Le
 * client a payé pour rien et rien dans les journaux ne signale l'erreur.
 *
 * Donc : en production, l'absence de variable **casse le build**. En
 * développement, le défaut reste la sandbox, où le paiement n'a aucune valeur.
 */
function resolveBaseUrl(): string {
  const configured = process.env.PAWAPAY_BASE_URL?.trim().replace(/\/$/, '');

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'PAWAPAY_BASE_URL est obligatoire en production. Renseignez ' +
          `${PAWAPAY_PRODUCTION_URL} (production) ou ${PAWAPAY_SANDBOX_URL} (bac à sable). ` +
          'Sans cette variable, les paiements seraient acceptés dans la mauvaise passerelle.',
      );
    }
    return PAWAPAY_SANDBOX_URL;
  }

  if (!configured.startsWith('https://')) {
    throw new Error(
      'PAWAPAY_BASE_URL doit être une URL https. Le jeton d’API est envoyé dans chaque ' +
        'requête et ne doit pas transit en clair.',
    );
  }

  return configured;
}

export const PAWAPAY_BASE_URL = resolveBaseUrl();

/** Vrai quand l'environnement configuré est le bac à sable. */
export const isPawaPaySandbox = PAWAPAY_BASE_URL.includes('sandbox');

export const PAWAPAY_API_TOKEN = process.env.PAWAPAY_API_TOKEN?.trim() || '';

export type PawaPayDepositStatus =
  | 'ACCEPTED'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'NOT_FOUND';

export interface InitiatePaymentPageInput {
  depositId: string;
  returnUrl: string;
  amount: number | string;
  reason: string;
  country?: string;
  currency?: string;
  msisdn?: string;
}

export interface InitiatePaymentPageResponse {
  redirectUrl: string;
}

export interface PawaPayDepositDetail {
  depositId: string;
  status: PawaPayDepositStatus;
  amount?: string;
  currency?: string;
  payer?: {
    type?: string;
    accountDetails?: {
      phoneNumber?: string;
      provider?: string;
    };
  };
  failureReason?: {
    failureCode?: string;
    failureMessage?: string;
  };
  created?: string;
}

export class PawaPayError extends Error {
  status?: number;
  body?: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = 'PawaPayError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Vérifie si les identifiants pawaPay sont configurés.
 */
export function isPawaPayConfigured(): boolean {
  return PAWAPAY_API_TOKEN.length > 0;
}

/**
 * Un paiement en production ne peut pas être encaissé par le bac à sable.
 *
 * Fonction appelée par `/initiate` avant d'ouvrir une page de paiement : mieux
 * vaut refuser une vente que de la faire payer pour rien.
 */
export function assertPaymentEnvironmentIsSound(): string | null {
  if (!isPawaPayConfigured()) return 'PAWAPAY_API_TOKEN non configuré.';

  if (process.env.NODE_ENV === 'production' && isPawaPaySandbox) {
    return (
      'PAWAPAY_BASE_URL pointe vers le bac à sable en production : les paiements ' +
      'seraient acceptés mais jamais crédités.'
    );
  }

  return null;
}

/**
 * Initie une session de paiement via la page de paiement hébergée pawaPay (Hosted Payment Page).
 *
 * Appelle `POST /v2/paymentpage`.
 * Renvoie l'URL de redirection sécurisée (`redirectUrl`).
 */
export async function initiatePaymentPage(
  input: InitiatePaymentPageInput,
): Promise<InitiatePaymentPageResponse> {
  if (!isPawaPayConfigured()) {
    throw new PawaPayError(
      'PAWAPAY_API_TOKEN n’est pas configuré. Veuillez renseigner le token pawaPay dans vos variables d’environnement.',
    );
  }

  const endpoint = `${PAWAPAY_BASE_URL}/v2/paymentpage`;

  const payload: Record<string, unknown> = {
    depositId: input.depositId,
    returnUrl: input.returnUrl,
    reason: input.reason,
  };

  if (input.amount !== undefined && input.amount !== null) {
    payload.amountDetails = {
      amount: String(input.amount),
      currency: input.currency || 'XOF',
    };
    payload.country = input.country || 'BFA';
  } else if (input.country) {
    payload.country = input.country;
  }

  if (input.msisdn) {
    payload.phoneNumber = input.msisdn;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAWAPAY_API_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg =
      (data && typeof data === 'object' && ('message' in data || 'errorMessage' in data))
        ? String(data.message || data.errorMessage)
        : `Erreur API pawaPay HTTP ${response.status}`;
    throw new PawaPayError(errorMsg, response.status, data);
  }

  if (!data?.redirectUrl) {
    throw new PawaPayError(
      'Réponse invalide de pawaPay : aucun redirectUrl renvoyé.',
      response.status,
      data,
    );
  }

  return { redirectUrl: data.redirectUrl };
}

/**
 * Vérifie le statut d'un dépôt (depositId) directement auprès de pawaPay.
 *
 * Appelle `GET /v2/deposits/{depositId}`.
 */
export async function checkDepositStatus(
  depositId: string,
): Promise<PawaPayDepositDetail | null> {
  if (!isPawaPayConfigured()) {
    throw new PawaPayError('PAWAPAY_API_TOKEN n’est pas configuré.');
  }

  const endpoint = `${PAWAPAY_BASE_URL}/v2/deposits/${encodeURIComponent(depositId)}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${PAWAPAY_API_TOKEN}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return {
      depositId,
      status: 'NOT_FOUND',
    };
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg =
      (data && typeof data === 'object' && ('message' in data || 'errorMessage' in data))
        ? String(data.message || data.errorMessage)
        : `Erreur HTTP ${response.status} lors de la vérification pawaPay`;
    throw new PawaPayError(errorMsg, response.status, data);
  }

  // pawaPay peut renvoyer un tableau de dépôts ou un objet unique
  if (Array.isArray(data) && data.length > 0) {
    return data[0] as PawaPayDepositDetail;
  }

  if (data && typeof data === 'object' && 'depositId' in data) {
    return data as PawaPayDepositDetail;
  }

  return null;
}