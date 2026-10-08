'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Notifications discrètes, en bas de l'écran.
 *
 * Pourquoi un module dédié plutôt qu'un `setState` local : la confirmation doit
 * pouvoir être déclenchée depuis n'importe quel point du parcours (le
 * téléchargement vit dans le parcours, la copie du lien dans le panneau de
 * partage) et rester **identique** partout. Un état local par composant
 * finirait par donner deux habillages pour la même information.
 *
 * Trois règles :
 *
 *   1. **Empilable.** Deux actions rapides donnent deux notifications, jamais
 *      un remplacement silencieux de la première.
 *   2. **Bornée.** Au-delà de trois, la plus ancienne disparaît : une pile qui
 *      grandit masque le contenu de la page.
 *   3. **Non bloquante.** Le conteneur est `pointer-events-none`, seules les
 *      notifications le sont — un toast ne doit jamais empêcher un clic sur le
 *      visuel qu'il commente.
 */

/** Durée d'affichage. Assez pour être lu, trop court pour gêner. */
const TOAST_DURATION_MS = 2600;

/** Pile maximale : au-delà, la plus ancienne est retirée. */
const MAX_VISIBLE = 3;

interface Toast {
  id: number;
  message: string;
}

type Notify = (message: string) => void;

const ToastContext = createContext<Notify | null>(null);

/**
 * Accès à la notification.
 *
 * Lève hors provider : une notification silencieusement avalée est pire qu'une
 * erreur visible — on croit avoir confirmé une action à l'utilisateur, et rien
 * n'apparaît.
 */
export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) {
    throw new Error('useToast() doit être appelé à l’intérieur de <ToastProvider>.');
  }
  return notify;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  /** Minuteries vivantes, pour ne pas toucher un composant démonté. */
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message: string) => {
      const id = nextId.current++;

      setToasts((current) => [...current, { id, message }].slice(-MAX_VISIBLE));
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), TOAST_DURATION_MS),
      );
    },
    [dismiss],
  );

  // Démontage : aucune minuterie ne survit au provider.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  /*
   * Le portail n'est pas décoratif : posée dans l'arbre, la pile serait enfermée
   * dans le contexte d'empilement de son parent (`overflow`, `transform`) et
   * rognée au milieu de la page.
   */
  const stack =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <div
            /*
             * `role="status"` + `aria-live="polite"` : le lecteur d'écran annonce
             * la confirmation sans interrompre ce que l'utilisateur est en train
             * de lire. Le conteneur reste monté même vide — sinon la région
             * live n'existerait pas au moment où le message arrive.
             */
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className="pointer-events-auto flex max-w-[92vw] items-center gap-3 rounded-full bg-ink py-2.5 pl-4 pr-2 text-[13px] font-medium text-white shadow-lg animate-fade-up"
              >
                <span className="truncate">{toast.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Fermer la notification"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      {stack}
    </ToastContext.Provider>
  );
}
