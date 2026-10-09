'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Check, Clock, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { CountryPickerModal } from '@/components/payments/country-picker-modal';
import { useToast } from '@/components/ui/toast';
import { PASS_DURATION_HOURS, PASS_PRODUCT_LABEL, formatPassPrice } from '@/lib/pass-config';
import type { WatermarkPassState } from '@/components/participant/use-watermark-pass';

/**
 * Le pass « Sans filigrane — 24 h » sur la page participant, en **deux
 * surfaces** qui ne disent jamais la même chose :
 *
 *   1. `WatermarkPassStatus` — l'**état**, dans le flux, juste sous les boutons
 *      d'export : « votre pass est actif, il reste X h », ou « paiement en cours
 *      de vérification ». C'est une information, pas une sollicitation ; elle
 *      n'apparaît que si l'un de ces deux états est vrai.
 *   2. `WatermarkPassButton` — l'**offre**, en bulle flottante ancrée en bas à
 *      droite, visible pendant toute la visite. Un clic ouvre la fenêtre du
 *      produit (prix, durée, ce qui est payé), dont le bouton « Payer » mène au
 *      choix du pays puis à la page de paiement.
 *
 * Pourquoi séparer les deux : une carte d'offre insérée dans le flux se perd
 * dès que le participant fait défiler la page pour composer son visuel, et elle
 * occupe la place des boutons qu'il cherche. La bulle, elle, reste à portée sans
 * rien pousser ; et elle disparaît d'elle-même dès qu'il n'y a plus rien à
 * vendre — pass actif ou paiement en cours.
 *
 * Ce que ces composants ne font pas, et pourquoi :
 *   - ils ne décident jamais du prix ni de la durée : ils viennent de
 *     `lib/pass-config.ts`, lui-même dérivé de la grille tarifaire. Le client
 *     n'envoie que le pays choisi ;
 *   - ils n'activent rien : la page de paiement hébergée prend la main, puis
 *     c'est le serveur (webhook ou retour) qui confirme et active ;
 *   - ils ne masquent pas le badge localement : quand le pass est actif, c'est
 *     l'export qui change de chemin (PNG rendu côté serveur), pas une case
 *     décochée dans le navigateur.
 */

type PassState = WatermarkPassState & { refresh: () => Promise<void> };

/** Compte à rebours lisible, rafraîchi sans faire travailler le rendu à chaque seconde. */
function useRemainingLabel(endsAt: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!endsAt) {
      setLabel(null);
      return;
    }
    const tick = () => {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (!Number.isFinite(ms) || ms <= 0) {
        setLabel(null);
        return;
      }
      const totalMinutes = Math.floor(ms / 60_000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      setLabel(hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min`);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  return label;
}

/**
 * État du pass, **dans le flux**.
 *
 * Ne rend rien tant que l'état est inconnu, et rien non plus quand aucun pass
 * n'existe : la sollicitation d'achat est portée par la bulle, jamais ici.
 */
export function WatermarkPassStatus({ pass }: { pass: PassState }) {
  const remaining = useRemainingLabel(pass.active ? pass.endsAt : null);

  if (!pass.ready || (!pass.active && !pass.pending)) return null;

  if (pass.active) {
    return (
      <div className="ring-brand-gradient mt-4 rounded-xl bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-purple/10 text-purple">
            <BadgeCheck className="size-4.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-purple">
              Pass actif
            </span>
            <h3 className="mt-1 text-[15px] font-bold leading-snug text-ink">
              Téléchargement sans filigrane
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
              {remaining ? (
                <>
                  Il vous reste <span className="font-semibold text-ink">{remaining}</span>.{' '}
                </>
              ) : null}
              Le visuel PNG est produit sans badge pour ce navigateur.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
          <Clock className="size-4.5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-snug text-ink">
            Paiement en cours de vérification
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
            Validez le paiement sur votre téléphone. Le pass s’activera dès la confirmation de
            l’opérateur.
          </p>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => void pass.refresh()}>
            <RefreshCw className="size-3.5" aria-hidden />
            Vérifier maintenant
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Fenêtre du produit, ouverte par la bulle.
 *
 * Elle existe pour une raison précise : le participant doit pouvoir lire ce
 * qu'il achète **avant** qu'on lui demande son pays, et le montant doit être
 * vérifiable au moment où il appuie sur « Payer ». Le pays ne change jamais ce
 * montant — il ne choisit que le corridor Mobile Money.
 */
function PassOfferModal({
  open,
  onClose,
  onPay,
}: {
  open: boolean;
  onClose: () => void;
  onPay: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Le portail touche `document.body` : il n'existe pas au rendu serveur.
  useEffect(() => setMounted(true), []);

  // ── Piège à focus, Échap, verrouillage du scroll ─────────────────────────
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
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
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const facts = [
    'Aucun compte à créer, aucun abonnement.',
    `Un paiement Mobile Money de ${formatPassPrice()}.`,
    `Valable ${PASS_DURATION_HOURS} h sur ce navigateur, pas sur un autre.`,
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={cn(
          'relative flex w-[min(440px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] flex-col',
          'overflow-y-auto rounded-2xl bg-white shadow-lg',
          'animate-fade-up motion-reduce:animate-none',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-1 pt-6">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500">
              <ShieldCheck className="size-3.5" aria-hidden />
              Sans compte
            </span>
            <h2 id={titleId} className="mt-3 text-[20px] font-bold leading-snug text-ink">
              Supprimer le filigrane pendant {PASS_DURATION_HOURS} h
            </h2>
            <p id={descId} className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
              Le badge disparaît de vos téléchargements PNG, pendant {PASS_DURATION_HOURS} heures.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre"
            className={cn(
              '-mr-1.5 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-pill',
              'text-gray-400 transition-colors duration-150 ease-brand',
              'hover:bg-gray-100 hover:text-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple',
            )}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Prix — ce qui est payé, écrit noir sur blanc avant toute redirection. */}
        <div className="mx-6 mt-5 flex items-baseline justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
          <span className="min-w-0 truncate text-[13px] text-gray-500">{PASS_PRODUCT_LABEL}</span>
          <span className="shrink-0 text-[18px] font-bold tabular-nums text-ink">
            {formatPassPrice()}
          </span>
        </div>

        <ul className="mt-5 flex flex-col gap-2.5 px-6">
          {facts.map((fact) => (
            <li key={fact} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-gray-600">
              <Check className="mt-0.5 size-3.5 shrink-0 text-purple" strokeWidth={2.5} aria-hidden />
              {fact}
            </li>
          ))}
        </ul>

        <div className="px-6 pb-6 pt-6">
          <Button variant="primary" size="lg" className="w-full" onClick={onPay}>
            <Sparkles className="size-4" aria-hidden />
            Payer {formatPassPrice()}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'mt-3 w-full rounded-pill py-2 text-center text-[13px] font-medium',
              'text-gray-500 transition-colors duration-150 ease-brand hover:text-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple',
            )}
          >
            Plus tard
          </button>
          <p className="mt-4 text-center text-[12px] leading-relaxed text-gray-400">
            Vous choisirez votre pays de paiement à l’étape suivante. Aucun montant n’est débité
            avant votre validation sur votre téléphone.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Bulle flottante « Promo » — la seule surface d'achat du pass.
 *
 * Elle n'existe que lorsqu'il y a quelque chose à vendre : pas de pass actif,
 * pas de paiement en route, et une première lecture de l'état terminée. Tant que
 * l'état est inconnu, on n'annonce rien — proposer un pass à quelqu'un qui en
 * détient déjà un serait un faux pas le temps d'un aller-retour réseau.
 */
export function WatermarkPassButton({ pass }: { pass: PassState }) {
  const router = useRouter();
  const notify = useToast();
  const [mounted, setMounted] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le portail touche `document.body` : il n'existe pas au rendu serveur.
  useEffect(() => setMounted(true), []);

  const startCheckout = useCallback(
    async (countryCode: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/passes/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country: countryCode }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          redirectUrl?: string;
          error?: string;
          checkoutId?: string;
        };

        if (res.ok && data.redirectUrl) {
          // La page de paiement hébergée prend la main.
          window.location.href = data.redirectUrl;
          return;
        }

        /*
         * Deux refus « 409 » ne sont pas des erreurs pour l'utilisateur : le
         * droit existe déjà, ou un paiement est en route. On ne lui montre donc
         * pas un message d'échec — on le conduit vers le bon état.
         */
        if (res.status === 409 && data.error === 'already_active') {
          setCountryOpen(false);
          setBusy(false);
          await pass.refresh();
          notify('Votre pass est déjà actif ✓');
          return;
        }
        if (res.status === 409 && data.error === 'already_pending' && data.checkoutId) {
          setCountryOpen(false);
          setBusy(false);
          router.push(`/pass/retour?checkoutId=${encodeURIComponent(data.checkoutId)}`);
          return;
        }

        setError(data.error ?? 'Le paiement n’a pas pu être préparé. Réessayez dans un instant.');
        setBusy(false);
      } catch {
        setError('Connexion impossible au service de paiement. Vérifiez votre réseau.');
        setBusy(false);
      }
    },
    [pass, notify, router],
  );

  if (!pass.ready || pass.active || pass.pending) return null;

  return (
    <>
      {mounted &&
        createPortal(
          <button
            type="button"
            onClick={() => {
              setError(null);
              setOfferOpen(true);
            }}
            aria-haspopup="dialog"
            className={cn(
              'fixed right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-pill',
              // Le dégradé est réservé au CTA premium : cette bulle *est* ce CTA.
              'bg-brand-gradient py-2 pl-2 pr-4 text-left text-white shadow-lg',
              'transition-transform duration-200 ease-brand hover:scale-[1.02] active:scale-[.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple focus-visible:ring-offset-2',
              'animate-fade-up motion-reduce:animate-none',
            )}
            // Au-dessus de la barre gestuelle iOS, sans coller au bord.
            style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-white/20">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">
                Promo
              </span>
              <span className="block truncate text-[13px] font-semibold">
                Sans filigrane {PASS_DURATION_HOURS} h · {formatPassPrice()}
              </span>
            </span>
          </button>,
          document.body,
        )}

      <PassOfferModal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        onPay={() => {
          // Le pays reste **demandé, jamais deviné** : il fixe le corridor
          // Mobile Money, pas le montant.
          setOfferOpen(false);
          setError(null);
          setCountryOpen(true);
        }}
      />

      <CountryPickerModal
        open={countryOpen}
        loading={busy}
        error={error}
        summary={{ label: PASS_PRODUCT_LABEL, amount: formatPassPrice() }}
        onClose={() => {
          if (busy) return;
          setCountryOpen(false);
          setError(null);
        }}
        onConfirm={({ countryCode }) => {
          void startCheckout(countryCode);
        }}
        onRetry={() => {
          setError(null);
        }}
      />
    </>
  );
}
