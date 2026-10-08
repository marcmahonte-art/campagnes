'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Facebook,
  Link2,
  MessageCircle,
  Music2,
  Share2,
  Smartphone,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  TIKTOK_UPLOAD_URL,
  facebookShareUrl,
  whatsappShareUrl,
  type ShareEventType,
} from '@/lib/share';

/**
 * Menu de partage — le **seul** point d'entrée du partage.
 *
 * Le montage précédent affichait en permanence une rangée de cinq boutons sous
 * un titre « Partager » qui n'était pas cliquable : l'action principale du bloc
 * était morte, et cinq destinations se disputaient l'attention alors que le
 * participant n'en choisit qu'une. On garde le choix, on le range derrière un
 * déclencheur.
 *
 * Deux présentations, une seule logique :
 *   - **popover** sur desktop (>= 768 px), aligné sur le déclencheur ;
 *   - **bottom sheet** sur mobile, posé par portail — la même chose qu'une
 *     feuille native, celle que le pouce atteint sans changer de main.
 *
 * Le comportement clavier est celui d'un `role="menu"` : flèches pour
 * circuler, Début/Fin pour les extrémités, Échap pour fermer, Tab piégé dans le
 * menu, et **retour du focus sur le déclencheur** à la fermeture — sans quoi un
 * utilisateur au clavier repartirait du haut de la page.
 */

/** Éléments du menu : ceux qui portent `role="menuitem"`. */
const ITEM_SELECTOR = '[role="menuitem"]';

/** Tout ce qui peut recevoir le focus dans la feuille mobile (fermer inclus). */
const FOCUSABLE_SELECTOR = '[role="menuitem"], button:not([disabled])';

function isCompactViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

interface ShareMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Lien à ouvrir (WhatsApp, Facebook, TikTok) — `run` est alors absent. */
  href?: string;
  /** Action à exécuter (copie, partage natif). */
  run?: () => void | Promise<void>;
  /** Événement de journalisation, facultatif et jamais bloquant. */
  track?: ShareEventType;
  /** Précision affichée sous le libellé, dans la feuille mobile. */
  hint?: string;
}

export function ShareMenu({
  url,
  text,
  title,
  onCopyLink,
  onTrack,
  label = 'Partager',
}: {
  /** URL partagée — toujours l'adresse publique, jamais un jeton. */
  url: string;
  /** Texte pré-rempli (« Je participe au SIAO 2026 » + lien). */
  text: string;
  /** Titre du partage natif, quand il existe. */
  title?: string;
  /** Copie le lien. Renvoie `true` si le presse-papiers a accepté. */
  onCopyLink: () => Promise<boolean> | boolean;
  /** Journalisation d'un partage. */
  onTrack?: (event: ShareEventType) => void;
  /** Libellé du déclencheur. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(isCompactViewport);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Le déclencheur **et** le popover desktop, pour le clic extérieur. */
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  /*
   * `navigator.share` n'existe que sur mobile et en HTTPS. Lu après le montage :
   * pendant le rendu, il ferait diverger le HTML du serveur et du navigateur.
   */
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const onChange = () => setCompact(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const items = useMemo<ShareMenuItem[]>(() => {
    const list: ShareMenuItem[] = [
      {
        id: 'whatsapp',
        label: 'WhatsApp',
        icon: MessageCircle,
        href: whatsappShareUrl(text),
        track: 'share_whatsapp',
        hint: 'Le texte est pré-rempli.',
      },
      {
        id: 'facebook',
        label: 'Facebook',
        icon: Facebook,
        href: facebookShareUrl(url),
        track: 'share_facebook',
        hint: 'Publication sur votre mur.',
      },
      {
        id: 'tiktok',
        label: 'TikTok',
        icon: Music2,
        href: TIKTOK_UPLOAD_URL,
        track: 'share_tiktok',
        hint: 'Ouvre la page de dépôt : le lien ne se partage pas.',
      },
    ];

    /*
     * La feuille native, quand elle existe : elle donne accès à toutes les
     * applications installées, ce qu'aucune liste ne peut égaler. Proposée en
     * plus, jamais à la place — une entrée conditionnelle n'est pas une
     * fonctionnalité cachée, c'est un chemin de plus quand l'appareil le permet.
     */
    if (canNativeShare) {
      list.push({
        id: 'native',
        label: 'Autres applications',
        icon: Smartphone,
        run: () => {
          void navigator.share?.({ title, text, url }).catch(() => {});
        },
        track: 'share_clicked',
        hint: 'Feuille de partage de votre téléphone.',
      });
    }

    list.push({
      id: 'copy',
      label: 'Copier le lien',
      icon: Link2,
      run: async () => {
        await onCopyLink();
      },
      track: 'share_copy_link',
      hint: 'Copie l’adresse publique de la campagne.',
    });

    return list;
  }, [canNativeShare, onCopyLink, text, title, url]);

  /**
   * Fermeture.
   *
   * `restoreFocus` est faux dans un seul cas : un clic extérieur. Rendre le
   * focus au bouton quand l'utilisateur a cliqué ailleurs le ramènerait là où
   * il n'est plus — dans tous les autres cas (Échap, action, fermeture mobile)
   * le focus doit revenir au déclencheur.
   */
  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  /* ---------------- Clavier ---------------- */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }

      const panel = panelRef.current;
      const entries = panel?.querySelectorAll<HTMLElement>(ITEM_SELECTOR);
      if (!entries || entries.length === 0) return;

      const index = Array.from(entries).indexOf(document.activeElement as HTMLElement);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        entries[(index + 1) % entries.length].focus();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        entries[(index - 1 + entries.length) % entries.length].focus();
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        entries[0].focus();
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        entries[entries.length - 1].focus();
        return;
      }
      if (event.key === 'Tab') {
        // Piège à focus : la tabulation tourne dans le menu, elle n'en sort pas.
        const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Le focus entre dans le menu juste après son rendu, pas avant.
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
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
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  const select = useCallback(
    async (item: ShareMenuItem) => {
      if (item.track) onTrack?.(item.track);
      if (item.run) {
        await item.run();
        // Une action referme le menu : le geste est terminé.
        close();
      } else {
        // Un lien s'ouvre seul (`<a target="_blank">`) ; on referme derrière lui.
        close();
      }
    },
    [close, onTrack],
  );

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={() => setOpen((current) => !current)}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-purple px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-purple/90"
    >
      <Share2 className="size-4" strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );

  /* ---------------- Feuille mobile ---------------- */
  const sheet =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <div className="fixed inset-0 z-50 flex items-end" role="presentation">
            <button
              type="button"
              aria-label="Fermer le menu de partage"
              onClick={() => close()}
              className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px]"
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              className="relative z-10 w-full rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg animate-fade-up"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-[15px] font-semibold text-ink">{label}</span>
                <button
                  type="button"
                  onClick={() => close()}
                  aria-label="Fermer"
                  className="-mr-1 flex size-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              <div id={menuId} role="menu" className="mt-3 flex flex-col">
                {items.map((item) => {
                  const Icon = item.icon;
                  const content = (
                    <>
                      <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block text-[14px] font-medium text-ink">{item.label}</span>
                        {item.hint && (
                          <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">
                            {item.hint}
                          </span>
                        )}
                      </span>
                    </>
                  );

                  const className =
                    'flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-gray-50';

                  return item.href ? (
                    <a
                      key={item.id}
                      role="menuitem"
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void select(item)}
                      className={className}
                    >
                      {content}
                    </a>
                  ) : (
                    <button
                      key={item.id}
                      role="menuitem"
                      type="button"
                      onClick={() => void select(item)}
                      className={className}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        );

  /* ---------------- Popover desktop ---------------- */
  const popover = (
    <div
      ref={panelRef}
      id={menuId}
      role="menu"
      aria-label={label}
      className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg animate-fade-up"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const className =
          'flex w-full items-center gap-3 px-3.5 py-2.5 text-[13px] text-ink transition-colors hover:bg-gray-50';

        return item.href ? (
          <a
            key={item.id}
            role="menuitem"
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void select(item)}
            className={className}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {item.label}
          </a>
        ) : (
          <button
            key={item.id}
            role="menuitem"
            type="button"
            onClick={() => void select(item)}
            className={className}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      {trigger}
      {open && (compact ? sheet : popover)}
    </div>
  );
}
