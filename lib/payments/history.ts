import type { PaymentRecord } from '@/lib/types';
import { DISTRIBUTION_PACKS, PRICING_PLANS, PRICING_PERIODS, type BillingDuration } from '@/lib/pricing/config';

/**
 * Reconstitution de l'historique de paiement — couche de présentation.
 *
 * La table `payments` ne contient qu'un `plan`, un `campaign_id` et des
 * métadonnées. Elle ne dit pas « Pack 500 distributions » en clair : c'est le
 * code qui sait le dire. Cette fonction fait cette traduction, et rien d'autre.
 *
 * Pourquoi ne pas stocker un intitulé en base au moment de l'achat :
 * le nom du pack peut changer (renommage, evolution de la grille) alors que la
 * facture doit rester fidèle à ce qui a été vendu. Le nom stocké serait soit
 * figé, soit absent. Ici, on relit la grille au moment de l'affichage, et la
 * ligne `payments` reste la seule source de vérité financière.
 */

/** Statuts acceptés en base — alignés sur la contrainte `payments_status_check`. */
const KNOWN_STATUSES = new Set(['pending', 'completed', 'failed', 'cancelled']);

export interface PaymentRow {
  deposit_id?: string;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  plan?: string | null;
  campaign_id?: string | null;
  purchase_type?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
}

/** `12m` → « 12 mois ». Une durée inconnue ne devient jamais un texte inventé. */
function periodLabel(duration: string | null | undefined): string | null {
  if (!duration) return null;
  return PRICING_PERIODS.find((p) => p.id === duration)?.label ?? null;
}

/**
 * Intitulé lisible d'une ligne `payments`.
 *
 * Un achat de pack porte `campaign_id` et `plan` nul ; un abonnement l'inverse.
 * On s'appuie sur cette distinction — celle qu'utilise déjà
 * `credit_campaign_quota` — plutôt que sur `metadata.is_pack`, qui est une
 * convention d'écriture et pas une garantie d'unicité.
 */
export function paymentLabel(row: PaymentRow): string {
  const metadata = row.metadata ?? {};

  if (row.purchase_type === 'account_credits') {
    const packId = typeof metadata.pack_id === 'string' ? metadata.pack_id : null;
    const pack = packId ? DISTRIBUTION_PACKS.find((p) => p.id === packId) : null;
    return pack ? `Crédits du compte — ${pack.name}` : 'Crédits du compte';
  }

  if (row.campaign_id) {
    const packId = typeof metadata.pack_id === 'string' ? metadata.pack_id : null;
    const pack = packId ? DISTRIBUTION_PACKS.find((p) => p.id === packId) : null;
    if (pack) return pack.name;

    // Pack inconnu (retiré de la grille) : on ne réécrit pas le pack au hasard.
    const reason = typeof metadata.reason === 'string' ? metadata.reason : null;
    return reason ?? 'Pack de distribution';
  }

  if (row.plan) {
    const planName =
      PRICING_PLANS[row.plan as keyof typeof PRICING_PLANS]?.name ??
      (row.plan === 'organization' ? 'Organisations & ONG' : 'Créateur');

    const period = periodLabel(metadata.duration as BillingDuration | undefined);
    return period ? `${planName} — ${period}` : planName;
  }

  return 'Paiement';
}

/** Convertit une ligne `payments` en enregistrement affichable. */
export function toPaymentRecord(row: PaymentRow): PaymentRecord | null {
  const depositId = typeof row.deposit_id === 'string' ? row.deposit_id : null;
  if (!depositId) return null;

  const status = KNOWN_STATUSES.has(row.status ?? '')
    ? (row.status as PaymentRecord['status'])
    : 'pending';

  const amount = Number(row.amount);

  return {
    depositId,
    amountFcfa: Number.isFinite(amount) ? amount : 0,
    currency: row.currency ?? 'XOF',
    status,
    label: paymentLabel(row),
    kind: row.purchase_type === 'account_credits'
      ? 'credits'
      : row.campaign_id
        ? 'pack'
        : 'plan',
    /*
     * La date d'échéance n'est pas stockée sur la ligne `payments` : elle vit
     * dans `users.plan_expires_at`, qui décrit le compte et non la commande.
     * Une commanderé affichée ici concernserait un abonnement renouvelé depuis —
     * la rattacher à cette ligne serait un mensonge. L'écran affiche donc
     * l'échéance du compte courant, pas une date par commande.
     */
    planExpiresAt: null,
    createdAt: row.created_at ?? new Date().toISOString(),
    failureMessage: row.failure_message ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Ce qui mérite de figurer dans l'historique du client                */
/* ------------------------------------------------------------------ */

/**
 * Durée pendant laquelle un paiement qui n'a pas eu lieu reste visible.
 *
 * Deux situations, une seule durée :
 *
 *   - une ligne restée `pending` — le client a fermé la page de paiement avant
 *     d'appuyer sur « Pay », pawaPay n'a jamais enregistré de dépôt, et rien ne
 *     reviendra jamais la clore ;
 *   - une ligne `failed` portant le code `PAYMENT_NOT_APPROVED` — le client a
 *     refusé l'invite sur son téléphone, ou n'a pas saisi son PIN à temps.
 *     pawaPay décrit ce code comme « the customer did not authorize the
 *     payment » : la tentative n'a pas abouti, mais elle a bien eu lieu.
 *
 * Un paiement Mobile Money se règle en minutes. Une heure plus tard, aucune de
 * ces deux lignes ne décrit une attente réelle : elles décrivent un parcours
 * que le client a interrompu. Elles quittent alors l'historique.
 *
 * Pourquoi une durée plutôt qu'un statut : `/initiate` écrit la ligne **avant**
 * d'ouvrir la page de paiement, et rien ne reviendra jamais la clore si le
 * client abandonne. Le temps est le seul signal dont on dispose, et il est
 * fiable — il ne dépend d'aucun appel réseau.
 *
 * Ce que cela ne casse pas : un paiement qui se confirme plus tard repasse en
 * `completed` et **réapparaît** dans l'historique, à sa date d'origine. Masquer
 * n'est pas supprimer.
 */
export const ABANDONED_PAYMENT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Code d'échec pawaPay signifiant « le client n'a pas autorisé le paiement ».
 *
 * C'est le seul code de refus traité comme un abandon, et il l'est pour une
 * raison précise : il décrit une décision du client, pas un problème technique.
 * Les autres échecs — `INSUFFICIENT_BALANCE`, `WALLET_LIMIT_REACHED`,
 * `PAYER_NOT_FOUND`, `AMOUNT_OUT_OF_BOUNDS`… — restent visibles sans limite de
 * durée, parce que le client a besoin de les lire pour comprendre ce qui a
 * bloqué : lui cacher « solde insuffisant » le laisserait sans explication.
 *
 * `MANUALLY_CANCELLED` n'est délibérément pas ici : pawaPay ne l'émet que pour
 * les payouts et les remboursements, jamais pour un dépôt.
 */
export const REFUSED_PAYMENT_CODE = 'PAYMENT_NOT_APPROVED';

/**
 * Cette ligne `payments` doit-elle apparaître dans « Mes paiements » ?
 *
 * Deux exclusions, et seulement deux :
 *
 *   1. **`cancelled`** — un paiement annulé n'a jamais eu lieu. Le montrer
 *      revient à afficher une dépense qui n'existe pas, et à laisser croire au
 *      client qu'une somme est en suspens chez son opérateur. Cette exclusion
 *      ne dépend d'aucune date : elle est définitive.
 *   2. **un abandon, une fois la fenêtre écoulée** — un `pending` trop ancien,
 *      ou un `failed` portant `PAYMENT_NOT_APPROVED`. Voir
 *      `ABANDONED_PAYMENT_WINDOW_MS`. C'est ce qui rattrape les parcours
 *      interrompus, qu'aucun webhook ne viendra jamais clore.
 *
 * Ce qui reste visible, délibérément :
 *   - `completed`, évidemment ;
 *   - les autres `failed` — un refus technique de l'opérateur est une
 *     information utile, et l'écran en montre le motif ;
 *   - tout statut **inconnu** — on ne cache pas ce qu'on ne comprend pas. Si
 *     une valeur nouvelle apparaît en base, elle doit se voir, pas disparaître
 *     en silence.
 *
 * Une date illisible ne fait pas disparaître une ligne non plus : en cas de
 * doute on affiche, on ne supprime pas.
 *
 * Cette règle est **aussi écrite en SQL** dans `listPayments`, pour que
 * `limit(30)` ne soit pas consommé par des lignes destinées à être masquées.
 * Les deux doivent dire la même chose : c'est ce que vérifie
 * `check:payment-visibility`.
 */
export function isVisibleInPaymentHistory(
  row: PaymentRow,
  now: number = Date.now(),
): boolean {
  const status = row.status ?? '';

  if (status === 'cancelled') return false;

  /** Un abandon reste visible le temps de la fenêtre. Date illisible = on montre. */
  const dansLaFenetre = (createdAt: string | null | undefined): boolean => {
    const t = createdAt ? Date.parse(createdAt) : NaN;
    if (!Number.isFinite(t)) return true;
    return now - t <= ABANDONED_PAYMENT_WINDOW_MS;
  };

  if (status === 'pending') return dansLaFenetre(row.created_at);

  if (status === 'failed' && row.failure_code === REFUSED_PAYMENT_CODE) {
    return dansLaFenetre(row.created_at);
  }

  return true;
}