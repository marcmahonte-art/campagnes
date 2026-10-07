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

interface PaymentRow {
  deposit_id?: string;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  plan?: string | null;
  campaign_id?: string | null;
  purchase_type?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
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