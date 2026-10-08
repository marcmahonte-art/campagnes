'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronRight, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { payableCorridors, type PaymentCorridor } from '@/lib/payments/corridors';

/**
 * Choix du pays de paiement, **avant** l'ouverture de la page de paiement.
 *
 * Pourquoi une étape dédiée : le pays n'est pas une formalité administrative,
 * c'est lui qui fixe le corridor et la devise envoyés à la passerelle. Sans ce
 * choix, un acheteur ivoirien partait sur le corridor burkinabè, où son numéro
 * Mobile Money n'existe pas — l'échec remontait alors comme un refus
 * d'opérateur, c'est-à-dire comme une faute de l'utilisateur.
 *
 * Ce que ce composant ne fait **pas** :
 *   - il ne connaît ni la passerelle, ni la route d'initiation, ni un montant :
 *     il rend une décision (`countryCode`) et la remonte ;
 *   - il ne calcule aucun prix. Le montant reste celui du produit choisi, arrêté
 *     côté serveur. Le pays ne change jamais ce qui est payé, seulement où.
 */

/** Corridors réellement payables — les seuls proposés à l'utilisateur. */
const PAYABLE = payableCorridors();

export type CountryPickerResult = {
  /** Code ISO 3166-1 alpha-3, validé côté serveur avant emploi. */
  countryCode: string;
  corridor: PaymentCorridor;
};

interface CountryPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** Appelé quand l'utilisateur clique « Continuer vers le paiement ». */
  onConfirm: (result: CountryPickerResult) => void;
  /** Pays pré-sélectionné (alpha-3). `null` → aucun, bouton désactivé. */
  defaultCountry?: string | null;
  /** Initiation en cours : verrouille le modal sur l'état de préparation. */
  loading?: boolean;
  /** Échec de l'initiation, affiché à la place de la liste des pays. */
  error?: string | null;
  /** Bouton « Réessayer » de l'état d'erreur. */
  onRetry?: () => void;
  /**
   * Récapitulatif du produit, en lecture seule.
   *
   * Il est affiché pour une raison simple : l'utilisateur doit pouvoir vérifier
   * qu'il paie bien ce qu'il a choisi, au prix affiché dans Campagnes, au moment
   * où il s'apprête à payer.
   */
  summary?: { label: string; amount: string } | null;
}

export function CountryPickerModal({
  open,
  onClose,
  onConfirm,
  defaultCountry = null,
  loading = false,
  error = null,
  onRetry,
  summary = null,
}: CountryPickerModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<string | null>(defaultCountry);

  // Le portail touche `document.body` : il n'existe pas au rendu serveur.
  useEffect(() => setMounted(true), []);

  // Réinitialiser la sélection à chaque ouverture.
  useEffect(() => {
    if (open) setSelected(defaultCountry ?? null);
  }, [open, defaultCountry]);

  /*
   * Pendant la préparation, fermer serait un mensonge : la requête est partie,
   * elle aboutira ou pas, mais elle ne s'annule pas parce qu'on a cliqué ailleurs.
   * Même parti pris que `TopupConfirmModal`, qui bloque Échap pendant `busy`.
   */
  const locked = loading;

  const close = useCallback(() => {
    if (!locked) onClose();
  }, [locked, onClose]);

  // ── Piège à focus, Échap, verrouillage du scroll ─────────────────────────
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const FOCUSABLE =
      'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!locked) onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((element) => element.tabIndex !== -1);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 30);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, locked, onClose]);

  const selectedIndex = PAYABLE.findIndex((corridor) => corridor.countryCode === selected);
  const selectedCorridor = selectedIndex >= 0 ? PAYABLE[selectedIndex] : null;

  /**
   * Navigation au clavier dans la liste des pays.
   *
   * Les cartes forment un groupe de radios : un seul pays sélectionnable, et les
   * flèches font exactement ce qu'on attend d'une liste de ce type — ce que Tab
   * seul ne donne pas.
   */
  function onKeyDownList(event: React.KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();

    const count = PAYABLE.length;
    const from = selectedIndex >= 0 ? selectedIndex : delta > 0 ? -1 : 0;
    const next = (from + delta + count) % count;
    setSelected(PAYABLE[next].countryCode);
    cardRefs.current[next]?.focus();
  }

  function handleConfirm() {
    if (!selectedCorridor || locked) return;
    onConfirm({ countryCode: selectedCorridor.countryCode, corridor: selectedCorridor });
  }

  if (!mounted || !open) return null;

  // ── Contenu : préparation / échec / sélection ────────────────────────────

  let body: ReactNode;

  if (loading) {
    body = (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Loader2 className="size-7 animate-spin text-purple" aria-hidden />
        <p className="text-[14px] font-medium text-ink">Préparation de votre paiement…</p>
        <p className="max-w-xs text-[12px] leading-relaxed text-gray-500">
          Vous allez être redirigé vers la page de paiement Mobile Money.
        </p>
      </div>
    );
  } else if (error) {
    /**
     * Aucun détail technique ne remonte ici : ni trace, ni réponse JSON, ni nom
     * de prestataire. La route d'initiation renvoie déjà des messages écrits
     * pour l'utilisateur ; s'il y en a un, il sert de complément, jamais de
     * substitut au message principal.
     */
    body = (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-error/10">
          <X className="size-5 text-error" aria-hidden />
        </span>
        <p className="text-[15px] font-semibold text-ink">
          Impossible de préparer le paiement.
        </p>
        <p className="max-w-sm text-[13px] leading-relaxed text-gray-500">
          Veuillez réessayer. Aucun montant n’a été débité.
        </p>
        {error && (
          <p className="max-w-sm text-[12px] leading-relaxed text-gray-400">{error}</p>
        )}
        <div className="mt-3 flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Réessayer
            </Button>
          )}
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <div
          role="radiogroup"
          aria-labelledby={titleId}
          onKeyDown={onKeyDownList}
          className="flex flex-col gap-2.5"
        >
          {PAYABLE.map((corridor, index) => {
            const isSelected = selected === corridor.countryCode;
            return (
              <button
                key={corridor.countryCode}
                ref={(node) => {
                  cardRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                // Une seule carte est atteignable au Tab : les flèches parcourent le groupe.
                tabIndex={isSelected || (selectedIndex < 0 && index === 0) ? 0 : -1}
                onClick={() => setSelected(corridor.countryCode)}
                className={cn(
                  'flex w-full items-center gap-3.5 rounded-xl border p-4 text-left',
                  'transition-all duration-200 ease-brand',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple focus-visible:ring-offset-2',
                  isSelected
                    ? 'border-purple bg-purple/[0.06]'
                    : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50',
                )}
              >
                {/* Drapeau */}
                <span className="text-[22px] leading-none" aria-hidden>
                  {corridor.flag}
                </span>

                {/* Nom + opérateurs du corridor */}
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-tight text-ink">
                    {corridor.country}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-gray-500">
                    {corridor.dialCode} · {corridor.operators.join(', ')}
                  </span>
                </span>

                {/* Indicateur de sélection */}
                <span className="flex shrink-0 items-center gap-1.5">
                  {isSelected ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-purple">
                      <Check className="size-3 text-white" strokeWidth={3} aria-hidden />
                    </span>
                  ) : (
                    <ChevronRight
                      className="size-4 text-gray-300 transition-colors group-hover:text-gray-400"
                      aria-hidden
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!selectedCorridor}
            onClick={handleConfirm}
          >
            Continuer vers le paiement
            <ArrowRight className="size-4" aria-hidden />
          </Button>
          <p className="mt-3 text-center text-[12px] leading-relaxed text-gray-500">
            Le montant ne change pas selon le pays : il reste celui de votre achat.
          </p>
        </div>
      </>
    );
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex justify-center p-4',
        // Mobile : la fenêtre descend à portée du pouce. Desktop : centrée.
        'items-end sm:items-center',
      )}
      role="presentation"
    >
      {/* Overlay — clic extérieur pour fermer (jamais pendant la préparation). */}
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={close}
        className={cn(
          'absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px] animate-fade-up motion-reduce:animate-none',
          locked && 'cursor-wait',
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={cn(
          'relative flex w-[min(460px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] flex-col',
          'overflow-y-auto rounded-2xl bg-white shadow-lg',
          'animate-fade-up motion-reduce:animate-none',
        )}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 px-6 pb-1 pt-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[20px] font-bold leading-snug text-ink">
              Où souhaitez-vous payer ?
            </h2>
            <p id={descId} className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
              Sélectionnez votre pays pour continuer vers le paiement.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={locked}
            aria-label="Fermer la fenêtre"
            className={cn(
              '-mr-1.5 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-pill',
              'text-gray-400 transition-colors duration-150 ease-brand',
              'hover:bg-gray-100 hover:text-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Récapitulatif du produit — vérification, pas modification. */}
        {summary && !loading && !error && (
          <div className="mx-6 mt-4 flex items-baseline justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <span className="min-w-0 truncate text-[13px] text-gray-500">{summary.label}</span>
            <span className="shrink-0 text-[14px] font-semibold text-ink tabular-nums">
              {summary.amount}
            </span>
          </div>
        )}

        <div className="px-6 pb-6 pt-5">{body}</div>
      </div>
    </div>,
    document.body,
  );
}
