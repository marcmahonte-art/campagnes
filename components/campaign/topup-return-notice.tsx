'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, TriangleAlert } from 'lucide-react';

/**
 * Réconciliation du retour de paiement pawaPay — **un seul point**, monté une
 * fois par page.
 *
 * Pourquoi un composant à part, et pas dans le bouton : l'écran affiche quatre
 * paliers, donc quatre boutons. Si chacun portait la réconciliation, quatre
 * requêtes `/check` partiraient en parallèle au retour du paiement. Les
 * fonctions SQL sont idempotentes — rien ne serait crédité deux fois — mais on
 * interrogerait l'opérateur quatre fois pour rien, et quatre messages
 * concurrents se disputeraient l'écran. Ici, la logique vit à un seul endroit ;
 * les boutons ne s'occupent que d'acheter.
 *
 * Le quota lui-même n'est **jamais** écrit ici : `/check` appelle
 * `confirmPayment`, qui délègue à `credit_campaign_quota`. Ce composant ne fait
 * que déclencher et raconter.
 */
export function TopupReturnNotice({ campaignName }: { campaignName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(
    null,
  );
  /** Un `depositId` ne se réconcilie qu'une fois par montage (StrictMode, retours). */
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const depositId = searchParams.get('depositId');
    if (!depositId || handled.current === depositId) return;
    handled.current = depositId;

    let cancelled = false;

    const reconcile = async () => {
      try {
        const res = await fetch(
          `/api/payments/pawapay/check?depositId=${encodeURIComponent(depositId)}`,
        );
        const data = (await res.json()) as { status?: string; failureMessage?: string };
        if (cancelled) return;

        if (data.status === 'completed') {
          setNotice({
            tone: 'ok',
            text: `Paiement confirmé pour « ${campaignName} ». Le quota est à jour.`,
          });
          // Le quota est lu côté serveur : on rafraîchit pour afficher le vrai chiffre.
          router.refresh();
        } else if (data.status === 'failed') {
          setNotice({
            tone: 'error',
            text: `Le paiement n’a pas abouti${data.failureMessage ? ` : ${data.failureMessage}` : '.'} Aucun montant n’a été débité par Campagnes.`,
          });
        } else {
          setNotice({
            tone: 'warn',
            text: 'Paiement en cours de vérification auprès de l’opérateur. Le quota se mettra à jour dès la confirmation — vous pouvez fermer cette page.',
          });
        }
      } catch {
        if (!cancelled) {
          setNotice({
            tone: 'warn',
            text: 'Impossible de vérifier le paiement pour le moment. Rechargez la page dans un instant.',
          });
        }
      } finally {
        /*
         * On retire `depositId` de l'URL : sans cela, chaque rechargement
         * relancerait la vérification, et un lien partagé porterait une
         * référence de paiement qui ne concerne que son acheteur.
         */
        if (!cancelled) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete('depositId');
          const query = params.toString();
          router.replace(query ? `?${query}` : '?', { scroll: false });
        }
      }
    };

    void reconcile();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router, campaignName]);

  if (!notice) return null;

  const Icon = notice.tone === 'ok' ? CheckCircle2 : notice.tone === 'error' ? TriangleAlert : Clock;
  const classes =
    notice.tone === 'ok'
      ? 'border-success/30 bg-success/5 text-ink'
      : notice.tone === 'error'
        ? 'border-error/30 bg-error/5 text-error'
        : 'border-gray-200 bg-gray-50 text-gray-600';

  return (
    <p
      role="status"
      className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[12px] leading-relaxed ${classes}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span>{notice.text}</span>
    </p>
  );
}
