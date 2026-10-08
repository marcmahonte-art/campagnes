'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ArrowRight, Crown, LayoutTemplate, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Bannière du filigrane, tournée vers le créateur.
 *
 * Le participant n'a pas de compte, mais **le créateur regarde son propre
 * parcours** : c'est lui qui voit le badge sur ses visuels, et c'est lui qui
 * peut le retirer. La bannière ne s'adresse donc pas au participant — elle
 * s'adresse à celui qui paie, avec une porte de sortie explicite.
 *
 * Deux raisons DISTINCTES posent le badge, et la carte doit les dire sans les
 * mélanger :
 *
 *   - `fromPublicOnly` : le badge est posé **malgré** un créateur déjà payant,
 *     parce que le visuel est repris depuis la galerie, sans lien de
 *     distribution. Promettre « une formule le retire » serait faux — la seule
 *     sortie est la distribution privée.
 *   - sinon : le badge vient de la formule Gratuit du créateur. La formule
 *     Créateur le retire réellement, et la promesse est tenable.
 *
 * Le texte vit ici, pas dans le parcours : une incitation recopiée finirait par
 * promettre la même chose dans les deux cas.
 */

/** Ce qui peut recevoir le focus dans la modale. */
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled])';

interface Benefit {
  icon: typeof Crown;
  title: string;
  text: string;
}

/** Les bénéfices réellement livrés par la formule Créateur (lib/plans.ts). */
const CREATOR_BENEFITS: Benefit[] = [
  {
    icon: Sparkles,
    title: 'Formes et textes',
    text: 'Le cadre s’enrichit : formes, textes et calques illimités.',
  },
  {
    icon: LayoutTemplate,
    title: 'Modèles de cadres',
    text: 'La bibliothèque de modèles prêts à l’emploi.',
  },
];

export function WatermarkUpsell({ fromPublicOnly = false }: { fromPublicOnly?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  /** Le déclencheur est retrouvé par son identifiant : `Button` ne transmet pas de ref. */
  const triggerId = useId();

  const close = useCallback(
    (restoreFocus = true) => {
      setOpen(false);
      // Sans ce retour, un utilisateur au clavier repartirait du haut de la page.
      if (restoreFocus) document.getElementById(triggerId)?.focus();
    },
    [triggerId],
  );

  /**
   * La seule action qui compte : fermer la modale **puis** partir. Sans la
   * fermeture explicite, le portail resterait peint par-dessus la page
   * suivante au premier rendu.
   */
  const goToPlans = useCallback(() => {
    setOpen(false);
    router.push('/tarifs');
  }, [router]);

  /* ---------------- Clavier ---------------- */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      // Piège à focus : la tabulation tourne dans la modale, elle n'en sort pas.
      const panel = panelRef.current;
      const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Le focus entre dans la modale juste après son rendu, pas avant.
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    }, 30);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, close]);

  /* ---------------- Clic extérieur ---------------- */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      // Clic ailleurs : le focus ne revient pas au déclencheur, il n'est plus là.
      close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  /*
   * Le défilement du fond est bloqué pendant la modale : sur mobile, la page
   * continue sinon de bouger sous la feuille, et le geste de fermeture
   * emporte le contenu avec lui.
   */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /* ---------------- Contenu, selon la raison du badge ---------------- */
  const copy = fromPublicOnly
    ? {
        eyebrow: 'Vous êtes le créateur ?',
        title: 'Ce badge vient de l’accès public',
        text:
          'Un visuel repris depuis la galerie porte le badge, quelle que soit la formule. ' +
          'Distribuez votre campagne avec un lien privé : vos participants obtiennent un visuel net.',
        cta: 'Distribuer sans badge',
        modalTitle: 'Un visuel net pour vos participants',
        modalText:
          'Le badge distingue une campagne distribuée par son créateur d’un cadre simplement ' +
          'publié. La distribution privée l’exempte ; elle se paie à l’usage.',
        benefits: [
          {
            icon: Send,
            title: 'Distribution privée',
            text: 'Un lien privé distribue la campagne : le visuel sort sans badge.',
          },
          {
            icon: ShieldCheck,
            title: 'Badge retiré de vos campagnes',
            text: 'La formule Créateur retire le badge de tout ce que vous distribuez.',
          },
          ...CREATOR_BENEFITS,
        ] as Benefit[],
      }
    : {
        eyebrow: 'Vous êtes le créateur ?',
        title: 'Ce badge peut disparaître',
        text:
          'Le badge « Créé avec Campagnes » vient de la formule Gratuit du créateur. ' +
          'La formule Créateur le retire de tous ses visuels.',
        cta: 'Retirer ce badge',
        modalTitle: 'Passez à Créateur',
        modalText:
          'Ce que la formule Créateur change pour vos campagnes — sans rien retirer de ce ' +
          'que vous avez déjà publié.',
        benefits: [
          {
            icon: ShieldCheck,
            title: 'Aucun badge',
            text: 'Les visuels de vos campagnes ne portent plus le badge « Créé avec Campagnes ».',
          },
          ...CREATOR_BENEFITS,
          {
            icon: Crown,
            title: 'Campagnes illimitées',
            text: 'La formule Gratuit est limitée à une campagne par compte.',
          },
        ] as Benefit[],
      };

  /* ---------------- Modale ---------------- */
  const modal =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
            role="presentation"
          >
            <button
              type="button"
              aria-label="Fermer la fenêtre"
              onClick={() => close(false)}
              className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[2px] animate-fade-up motion-reduce:animate-none"
            />

            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none animate-fade-up motion-reduce:animate-none sm:rounded-2xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-[19px] font-bold leading-snug text-ink">
                    {copy.modalTitle}
                  </h2>
                  <p id={descriptionId} className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
                    {copy.modalText}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => close()}
                  aria-label="Fermer"
                  className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              <ul className="mt-4 flex flex-col gap-3">
                {copy.benefits.map((benefit) => {
                  const Icon = benefit.icon;
                  return (
                    <li key={benefit.title} className="flex gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-purple/10 text-purple">
                        <Icon className="size-4.5" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold text-ink">
                          {benefit.title}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-relaxed text-gray-500">
                          {benefit.text}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
                <Button variant="primary" size="md" onClick={goToPlans} className="w-full sm:w-auto">
                  Voir les formules
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => close()}
                  className="w-full sm:w-auto"
                >
                  Plus tard
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        );

  /* ---------------- Carte ---------------- */
  return (
    <>
      {/*
        Le liseré dégradé est réservé aux CTA premium (design system) : la
        carte se voit sans devenir un fond plein.
      */}
      <div className="ring-brand-gradient mt-4 rounded-xl bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-purple/10 text-purple">
            <Crown className="size-4.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-purple">
              {copy.eyebrow}
            </span>
            <h3 className="mt-1 text-[15px] font-bold leading-snug text-ink">{copy.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{copy.text}</p>
            <Button
              id={triggerId}
              variant="primary"
              size="md"
              className="mt-3 w-full sm:w-auto"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              {copy.cta}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {open && modal}
    </>
  );
}
