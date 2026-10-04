'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ShieldCheck, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatFcfaTier, type TopupTier } from '@/lib/quota';

/**
 * Confirmation avant un paiement Mobile Money.
 *
 * Pourquoi une boîte de dialogue, et pas un bouton qui agit directement : un
 * clic sur « +500 » engage une somme réelle, débitée sur un compte Mobile Money
 * et non remboursable par la plateforme. Confirmer le **montant** et le **volume**
 * sur un écran dédié est la moindre des choses — c'est aussi le seul endroit où
 * l'on peut dire clairement ce qui va se passer.
 *
 * Le composant ne connaît ni pawaPay ni les routes : il rend une décision et
 * remonte les paramètres. C'est `TopupButton` qui appelle l'API.
 */
export function TopupConfirmModal({
  open,
  onClose,
  onConfirm,
  campaignName,
  tier,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Nom de la campagne créditée — on paie pour elle, on l'affiche. */
  campaignName: string;
  tier: TopupTier | null;
  /** L'initiation est en cours : on verrouille les actions. */
  busy: boolean;
  /** Message d'échec de l'initiation, à afficher dans la boîte. */
  error: string | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        // Pendant l'initiation, Échap ne ferme pas : on ne veut pas laisser
        // l'utilisateur croire qu'il a annulé alors que la requête part.
        if (!busy) onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, busy, onClose]);

  const confirm = useCallback(() => {
    if (!busy) onConfirm();
  }, [busy, onConfirm]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={busy ? undefined : onClose}
        className={cn(
          'absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px] animate-fade-up motion-reduce:animate-none',
          busy && 'cursor-wait',
        )}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-confirm-title"
        tabIndex={-1}
        className="relative flex w-[min(440px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl bg-white shadow-lg outline-none animate-fade-up motion-reduce:animate-none"
      >
        <header className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
          <h2 id="topup-confirm-title" className="text-[18px] font-bold leading-tight">
            Confirmer le paiement
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer la fenêtre"
            className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-pill text-gray-400 transition-colors duration-150 ease-brand hover:bg-gray-100 hover:text-ink disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple"
          >
            <X className="size-4" strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="flex flex-col gap-4 px-6 pb-6">
          {/* Le récapitulatif : ce qu'on achète, pour qui, à quel prix. */}
          <dl className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-4 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Campagne</dt>
              <dd className="min-w-0 truncate font-medium text-ink">{campaignName}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500">Extension</dt>
              <dd className="font-medium text-ink">
                +{new Intl.NumberFormat('fr-FR').format(tier?.downloads ?? 0)} téléchargements
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2">
              <dt className="font-medium text-ink">Total à payer</dt>
              <dd className="text-[16px] font-bold text-ink">
                {tier ? formatFcfaTier(tier.priceFcfa) : '—'}
              </dd>
            </div>
          </dl>

          <p className="flex items-start gap-2.5 text-[12px] leading-relaxed text-gray-500">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-gray-400" strokeWidth={1.75} aria-hidden />
            <span>
              Vous serez redirigé vers la page de paiement pawaPay pour régler par Mobile
              Money (Orange, MTN, Moov, Wave…). Le quota de la campagne est crédité dès
              confirmation du paiement.
            </span>
          </p>

          <p className="flex items-start gap-2.5 text-[12px] leading-relaxed text-gray-500">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gray-400" strokeWidth={1.75} aria-hidden />
            <span>
              Aucun numéro n&apos;est conservé par Campagnes : le paiement est traité
              entièrement par pawaPay.
            </span>
          </p>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-error/30 bg-error/5 px-3 py-2.5 text-[12px] leading-relaxed text-error"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={confirm} disabled={busy || !tier}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Redirection…
                </>
              ) : (
                'Payer par Mobile Money'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
