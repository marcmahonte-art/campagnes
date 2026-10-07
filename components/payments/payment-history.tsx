'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Receipt, TriangleAlert, XCircle } from 'lucide-react';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import type { PaymentRecord } from '@/lib/types';
import { formatFcfaPrice } from '@/lib/pricing/config';

/**
 * Date d'un paiement, en français.
 *
 * `fr-FR` avec un fuseau forcé sur `Africa/Ouagadougou` : un paiement enregistré
 * à 23 h au Burkina peut arriver daté du lendemain côté navigateur, et une
 * facture qui avance d'un jour selon le poste qui l'affiche n'est pas une
 * facture. Le même motif sert pour la date d'échéance affichée plus bas.
 */
function formatPaymentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Ouagadougou',
  }).format(date);
}

/**
 * « Mes paiements » — historique factuel des paiements du compte.
 *
 * Ce que cette section montre, et rien de plus :
 *   - la date, le montant, l'offre achetée, le statut, la référence pawaPay.
 *
 * Ce qu'elle ne montre pas, et jamais : le jeton d'API, la clé de signature,
 * un en-tête de callback, ou quoi que ce soit qui permette d'agir sur le
 * compte d'autrui. La seule référence affichée est le `depositId`, qui est
 * l'identifiant public du dépôt chez pawaPay — c'est ce qu'on donne à son
 * opérateur en cas de litige, pas une authentification.
 *
 * Les données viennent de `backend.listPayments()`, qui lit `payments` sous la
 * session de l'utilisateur : c'est la RLS qui décide de ce qu'il voit.
 */

type StatusMeta = {
  label: string;
  className: string;
  Icon: typeof CheckCircle2;
};

const STATUS: Record<PaymentRecord['status'], StatusMeta> = {
  completed: {
    label: 'Confirmé',
    className: 'border-success/30 bg-success/5 text-success',
    Icon: CheckCircle2,
  },
  pending: {
    label: 'En cours de vérification',
    className: 'border-gray-200 bg-gray-50 text-gray-600',
    Icon: Clock,
  },
  failed: {
    label: 'Échoué',
    className: 'border-error/30 bg-error/5 text-error',
    Icon: XCircle,
  },
  cancelled: {
    label: 'Annulé',
    className: 'border-gray-200 bg-gray-50 text-gray-600',
    Icon: XCircle,
  },
};

export function PaymentHistory() {
  const { user } = useSession();
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      const records = await backend.listPayments(user.id);
      if (!cancelled) setPayments(records);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // `null` = chargement en cours. Distinguer ce cas de « aucun paiement » évite
  // d'afficher « vous n'avez jamais payé » pendant la requête.
  if (payments === null) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Receipt className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />
        <h3 className="text-[13px] font-semibold text-ink">Mes paiements</h3>
      </div>

      {payments.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-gray-500">
          Aucun paiement pour le moment. Vos packs de distribution et vos abonnements
          apparaîtront ici avec leur référence.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {payments.map((payment) => {
            const meta = STATUS[payment.status];
            const { Icon } = meta;

            return (
              <li key={payment.depositId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{payment.label}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {formatPaymentDate(payment.createdAt)} · {formatFcfaPrice(payment.amountFcfa)}
                  </p>
                  {payment.failureMessage && payment.status === 'failed' ? (
                    <p className="mt-1 flex items-start gap-1.5 text-[11px] text-error">
                      <TriangleAlert className="mt-0.5 size-3 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span>{payment.failureMessage}</span>
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
                  >
                    <Icon className="size-3" strokeWidth={2} aria-hidden />
                    {meta.label}
                  </span>
                  {/*
                   * La référence pawaPay, en petit : c'est l'identifiant du dépôt,
                   * utile pour rapprocher d'un relevé opérateur. Copiable, jamais
                   * un secret.
                   */}
                  <code className="font-mono text-[10px] tracking-tight text-gray-400">
                    {payment.depositId.slice(0, 8)}
                  </code>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}