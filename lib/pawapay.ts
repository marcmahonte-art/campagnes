/**
 * Client d'intégration PawaPay (Merchant API v2).
 *
 * Documentation officielle : https://docs.pawapay.io/v2/docs/how_to_start
 *
 * Utilise le mode Hosted Payment Page (/v2/paymentpage) pour permettre aux utilisateurs
 * de payer par Mobile Money (Orange, MTN, Moov, Wave, Airtel, etc.) dans une interface
 * optimisée, sécurisée et multi-pays.
 */

export const PAWAPAY_BASE_URL =
  process.env.PAWAPAY_BASE_URL?.trim().replace(/\/$/, '') || 'https://api.sandbox.pawapay.io';

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

  const payload: Record<string, string> = {
    depositId: input.depositId,
    returnUrl: input.returnUrl,
    amount: String(input.amount),
    reason: input.reason,
  };

  if (input.country) {
    payload.country = input.country;
  }
  if (input.currency) {
    payload.currency = input.currency;
  }
  if (input.msisdn) {
    payload.msisdn = input.msisdn;
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
