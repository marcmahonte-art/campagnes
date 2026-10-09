'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * État du pass « Sans filigrane » pour **ce** navigateur.
 *
 * Il interroge `/api/passes/status`, qui lit le cookie `cn_bid` et le
 * User-Agent : la réponse est donc propre au navigateur, jamais partagée.
 *
 * L'état sert deux choses, et une seule source les alimente :
 *   - l'interface (bouton d'achat, compte à rebours, paiement en cours) ;
 *   - la décision d'export — quand un pass est actif, le PNG est produit par le
 *     serveur (`/api/passes/export`) au lieu du navigateur, pour que le retrait
 *     du badge ne soit pas une simple case à décocher dans les DevTools.
 */

export interface WatermarkPassState {
  /** La première lecture est-elle terminée ? `false` → on n'affiche pas encore de conclusion. */
  ready: boolean;
  /** Un pass est actif pour ce navigateur. */
  active: boolean;
  /** Un paiement a été lancé mais n'est pas encore confirmé. */
  pending: boolean;
  /** Échéance ISO du pass actif, sinon `null`. */
  endsAt: string | null;
}

const INITIAL: WatermarkPassState = { ready: false, active: false, pending: false, endsAt: null };

export function useWatermarkPass(): WatermarkPassState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<WatermarkPassState>(INITIAL);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/passes/status', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        active?: boolean;
        pending?: boolean;
        endsAt?: string | null;
      };
      if (!alive.current) return;
      setState({
        ready: true,
        active: Boolean(data.active),
        pending: Boolean(data.pending),
        endsAt: typeof data.endsAt === 'string' ? data.endsAt : null,
      });
    } catch {
      // Une lecture ratée ne conclut rien : on marque seulement « interrogé ».
      if (alive.current) setState((current) => ({ ...current, ready: true }));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  return { ...state, refresh };
}
