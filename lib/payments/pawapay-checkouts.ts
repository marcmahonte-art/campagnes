/**
 * Client pawaPay **Checkouts** — produit distinct de la Hosted Payment Page.
 *
 * Pourquoi un module séparé plutôt qu'une extension de `lib/pawapay.ts` :
 * Checkouts (`POST /v2/checkouts`) et Hosted Payment Page (`POST /v2/paymentpage`)
 * sont **deux produits différents** avec deux cycles de vie différents. Les
 * mélanger ferait courir le risque de casser les abonnements et les packs déjà
 * en production, qui reposent sur `/v2/paymentpage` et sur `depositId`.
 *
 * Checkouts apporte ce dont le pass a besoin : une page hébergée, un
 * `checkoutId` fourni par nous (idempotent), et une vérification d'état par
 * `GET /v2/checkouts/{checkoutId}` — la source de vérité, jamais le navigateur.
 *
 * Documentation : https://docs.pawapay.io/v2/docs/checkouts
 */

import {
  PAWAPAY_API_TOKEN,
  PAWAPAY_BASE_URL,
  PawaPayError,
  isPawaPayConfigured,
} from '../pawapay';
import { PASS_DURATION_HOURS } from '../watermark-pass';

export interface CheckoutAmount {
  country: string;
  currency: string;
  amount: string;
}

export interface CreateCheckoutInput {
  /** UUIDv4 généré par nous, stocké en base **avant** l'appel. */
  checkoutId: string;
  returnUrl: string;
  /** Code ISO alpha-3, déjà validé par `resolvePaymentCountry`. */
  countryCode: string;
  currency: string;
  amount: number;
  durationHours?: number;
  /** Entre 3 et 60 minutes. La validation PIN est lente : 30 par défaut. */
  expiresAfterMinutes?: number;
}

/**
 * Construit le corps de `POST /v2/checkouts`.
 *
 * Fonction **pure**, donc testable sans réseau : c'est elle qui fixe le contrat
 * avec la passerelle (montant en chaîne, un pays, un montant).
 */
export function buildCheckoutPayload(input: CreateCheckoutInput): Record<string, unknown> {
  const durationHours = input.durationHours ?? PASS_DURATION_HOURS;

  const amounts: CheckoutAmount[] = [
    {
      country: input.countryCode,
      currency: input.currency,
      // En XOF, le montant est une chaîne sans décimale.
      amount: String(input.amount),
    },
  ];

  return {
    checkoutId: input.checkoutId,
    returnUrl: input.returnUrl,
    returnMethod: 'INSTANT',
    defaultLanguage: 'fr',
    countries: [input.countryCode],
    amounts,
    expiresAfter: input.expiresAfterMinutes ?? 30,
    clientReferenceId: `pass-${durationHours}h`,
    metadata: [
      { product: 'watermark_pass' },
      { durationHours: String(durationHours) },
    ],
  };
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${PAWAPAY_API_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/** Crée un checkout et renvoie l'URL de la page de paiement hébergée. */
export async function createCheckout(
  input: CreateCheckoutInput,
): Promise<{ redirectUrl: string; checkoutCode: string }> {
  if (!isPawaPayConfigured()) {
    throw new PawaPayError('PAWAPAY_API_TOKEN non configuré.');
  }

  const response = await fetch(`${PAWAPAY_BASE_URL}/v2/checkouts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(buildCheckoutPayload(input)),
  });

  const json = (await response.json().catch(() => null)) as
    | { status?: string; redirectUrl?: string; checkoutCode?: string; failureReason?: { failureCode?: string; failureMessage?: string } }
    | null;

  if (!response.ok) {
    throw new PawaPayError(
      `pawaPay Checkouts a refusé la requête (HTTP ${response.status}).`,
      response.status,
      json,
    );
  }

  // Rejeu du même checkoutId : pawaPay répond DUPLICATE_IGNORED, avec l'URL.
  if (json?.status === 'DUPLICATE_IGNORED' && json?.redirectUrl) {
    return { redirectUrl: json.redirectUrl, checkoutCode: json.checkoutCode ?? '' };
  }

  if (json?.status !== 'ACCEPTED' || !json?.redirectUrl) {
    const code = json?.failureReason?.failureCode ?? 'UNKNOWN';
    throw new PawaPayError(`pawaPay a rejeté le checkout : ${code}`, response.status, json);
  }

  return { redirectUrl: json.redirectUrl, checkoutCode: json.checkoutCode ?? '' };
}

export interface CheckoutState {
  status: string;
  completed: boolean;
  failed: boolean;
  amount: number;
  currency: string;
}

/**
 * État d'un checkout, lu chez pawaPay — **la** source de vérité.
 *
 * Un checkout peut contenir plusieurs tentatives ; on retient celle qui a
 * abouti (`depositsHistory`) pour connaître le montant réellement encaissé.
 */
export async function getCheckout(checkoutId: string): Promise<CheckoutState | null> {
  if (!isPawaPayConfigured()) {
    throw new PawaPayError('PAWAPAY_API_TOKEN non configuré.');
  }

  const response = await fetch(
    `${PAWAPAY_BASE_URL}/v2/checkouts/${encodeURIComponent(checkoutId)}`,
    { headers: { Authorization: `Bearer ${PAWAPAY_API_TOKEN}`, Accept: 'application/json' }, cache: 'no-store' },
  );

  if (response.status === 404) return null;

  const json = (await response.json().catch(() => null)) as
    | { status?: string; data?: Record<string, any> }
    | null;

  if (!response.ok || json?.status !== 'FOUND' || !json?.data) return null;

  const data = json.data;
  const history: any[] = Array.isArray(data.depositsHistory) ? data.depositsHistory : [];
  const completedDeposit =
    history.find((entry) => entry?.status === 'COMPLETED') ?? data.deposit ?? null;

  const status = String(data.status ?? '');

  return {
    status,
    completed: status === 'COMPLETED',
    failed: ['FAILED', 'EXPIRED', 'CANCELLED'].includes(status),
    amount: Number(completedDeposit?.amount ?? data.amounts?.[0]?.amount ?? NaN),
    currency: String(completedDeposit?.currency ?? data.amounts?.[0]?.currency ?? ''),
  };
}
