'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CampaignTypePreview } from '@/components/campaign/type-preview';
import { KIND_SPECS, kindSpec } from '@/lib/campaign-kinds';
import { cn } from '@/lib/cn';
import type { CampaignKind } from '@/lib/types';

/**
 * « Que voulez-vous créer ? »
 *
 * Le point d'entrée officiel de la création : on ne jette plus le créateur dans
 * un formulaire avant qu'il ait dit **ce qu'il veut faire**. Une question, trois
 * réponses, et l'aperçu qui suit le choix — c'est tout.
 *
 * Trois partis pris, et pourquoi :
 *
 * - **La question est celle du participant**, pas de la technique. « Les
 *   participants ajoutent une photo » plutôt que « mode Fond ». Le vocabulaire
 *   vient de `lib/campaign-kinds.ts`, donc du même endroit que l'éditeur :
 *   impossible que les deux divergent.
 * - **Aucun choix n'est caché derrière un menu.** Les trois types sont visibles
 *   ensemble, avec leur description. Un créateur qui ne sait pas encore ce qu'il
 *   veut doit pouvoir comparer.
 * - **Rien n'est créé au clic sur « Commencer ».** Le type part avec la requête
 *   et le formulaire suivant demande le nom. Créer un brouillon avant de savoir
 *   comment il s'appelle remplirait le tableau de bord de campagnes sans nom,
 *   sans adresse publique, et impossibles à supprimer d'un geste.
 */

const DEFAULT_KIND: CampaignKind = 'photo_frame';

export function CampaignTypeSelectorModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** Reçoit le type choisi. À l'appelant d'ouvrir l'éditeur correspondant. */
  onConfirm: (kind: CampaignKind) => void;
}) {
  const [kind, setKind] = useState<CampaignKind>(DEFAULT_KIND);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Le portail ne peut viser `document.body` qu'après l'hydratation.
  useEffect(() => setMounted(true), []);

  // Rouvrir le modal doit repartir du premier choix, jamais du dernier essai.
  useEffect(() => {
    if (open) setKind(DEFAULT_KIND);
  }, [open]);

  /*
   * Échap, piège à focus, et verrouillage du défilement de la page.
   *
   * Le piège est écrit à la main plutôt qu'emprunté à une librairie : il tient
   * en quinze lignes et évite une dépendance pour un seul écran.
   */
  useEffect(() => {
    if (!open || !mounted) return;

    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // On rend le focus à ce qui l'avait : le bouton « Nouvelle campagne ».
      previous?.focus?.();
    };
  }, [open, mounted, onClose]);

  const confirm = useCallback(() => onConfirm(kind), [kind, onConfirm]);

  if (!mounted || !open) return null;

  const selected = kindSpec(kind);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px] animate-fade-up motion-reduce:animate-none"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="type-selector-title"
        tabIndex={-1}
        className={cn(
          'relative flex w-[min(900px,calc(100vw-32px))] max-h-[88vh] flex-col overflow-hidden md:max-h-[85vh]',
          'rounded-xl bg-white shadow-lg outline-none animate-fade-up motion-reduce:animate-none',
        )}
      >
        {/* ---------------- En-tête ---------------- */}
        <header className="flex items-start justify-between gap-4 px-6 pb-4 pt-6 md:px-8 md:pt-8">
          <div className="min-w-0">
            <h2
              id="type-selector-title"
              className="text-[20px] font-bold leading-tight md:text-[24px]"
            >
              Que voulez-vous créer ?
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
              Choisissez ce que votre communauté déposera. Tout reste modifiable ensuite.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre"
            className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-pill text-gray-400 transition-colors duration-150 ease-brand hover:bg-gray-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple"
          >
            <X className="size-4" strokeWidth={2} aria-hidden />
          </button>
        </header>

        {/* ---------------- Corps : sélection + aperçu ---------------- */}
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6 md:grid md:grid-cols-[minmax(0,380px)_minmax(0,1fr)] md:items-start md:px-8 md:pb-8">
          <div
            role="radiogroup"
            aria-label="Type de campagne"
            className="flex flex-col gap-2.5"
          >
            {KIND_SPECS.map((spec) => {
              const active = spec.id === kind;
              const Icon = spec.icon;

              return (
                <button
                  key={spec.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setKind(spec.id)}
                  className={cn(
                    'group relative flex w-full items-start gap-3.5 rounded-md border px-4 py-3.5 text-left',
                    'transition-colors duration-200 ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple',
                    active
                      ? 'border-transparent bg-gray-50 ring-brand-gradient'
                      : 'border-gray-200 bg-white hover:border-gray-400',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-sm transition-colors duration-200',
                      active
                        ? 'bg-ink text-white'
                        : 'bg-gray-50 text-gray-400 group-hover:bg-gray-100',
                    )}
                  >
                    <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-[15px] font-semibold leading-tight',
                        active ? 'text-ink' : 'text-gray-700',
                      )}
                    >
                      {spec.label}
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-gray-500">
                      {spec.usage}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {spec.formats.map((format) => (
                        <span
                          key={format}
                          className={cn(
                            'rounded-pill border px-2 py-0.5 text-[11px] font-medium',
                            active
                              ? 'border-gray-300 bg-white text-gray-700'
                              : 'border-gray-200 bg-white text-gray-500',
                          )}
                        >
                          {format}
                        </span>
                      ))}
                    </span>
                  </span>

                  {active && (
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-gradient">
                      <Check className="size-3 text-white" strokeWidth={3} aria-hidden />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3">
            {/*
              Sur mobile, l'aperçu doit rester visible sans faire défiler : c'est
              lui qui confirme le choix. On le réduit plutôt que de le renvoyer
              sous la ligne de flottaison.
            */}
            <div className="rounded-lg bg-gray-50 p-3 md:p-6">
              <div className="mx-auto w-full max-w-[150px] md:max-w-[220px]">
                <CampaignTypePreview kind={kind} />
              </div>
            </div>
            <p className="px-1 text-[13px] leading-relaxed text-gray-500">
              {selected.detail}
            </p>
          </div>
        </div>

        {/* ---------------- Pied ---------------- */}
        <footer className="flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4 md:px-8">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" size="lg" onClick={confirm}>
            Commencer
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
