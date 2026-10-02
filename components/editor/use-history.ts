'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Historique « annuler / rétablir » d'une valeur immuable.
 *
 * L'éditeur l'utilise sur le **descripteur**, pas sur le canvas : c'est le
 * descripteur qui est la vérité, le canvas n'est qu'une vue. Annuler revient
 * donc à restaurer un descripteur, et l'état du canvas est reconstruit — jamais
 * « dé-animé » à la main.
 *
 * Deux garde-fous :
 * - `coalesce` regroupe les modifications qui s'enchaînent (une frappe, un
 *   déplacement continu) pour qu'un `Ctrl+Z` annule une **action**, pas un pixel ;
 * - `replace` change la valeur sans créer d'entrée : sans lui, le rechargement
 *   d'un cadre depuis la base empilerait une entrée fantôme.
 */

interface Snapshot<T> {
  past: T[];
  present: T;
  future: T[];
  /** Horodatage de la dernière entrée, pour le regroupement. */
  lastAt: number;
}

export interface HistoryState<T> {
  value: T;
  /** Empile une entrée et devient la valeur courante. */
  set: (next: T | ((prev: T) => T), options?: { coalesce?: boolean }) => void;
  /** Change la valeur sans empiler. */
  replace: (next: T | ((prev: T) => T)) => void;
  /** Vide l'historique et devient la valeur courante. */
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(
  initial: T,
  options: {
    limit?: number;
    coalesceMs?: number;
    /**
     * Égalité entre deux valeurs.
     *
     * Par défaut l'identité (`Object.is`), ce qui suffit quand la valeur est un
     * objet construit à neuf à chaque vraie modification. Dès qu'un appelant
     * produit des objets neufs même quand rien n'a changé — le cas d'un état
     * composite réécrit par un geste au doigt — l'identité ne suffit plus :
     * l'historique se remplit d'entrées identiques et « annuler » n'avance plus.
     * Fournir une comparaison structurelle rend le regroupement honnête.
     */
    equals?: (a: T, b: T) => boolean;
  } = {},
): HistoryState<T> {
  const limit = options.limit ?? 60;
  const coalesceMs = options.coalesceMs ?? 700;
  const equals = options.equals ?? Object.is;

  /** Stable : permet de l'utiliser dans les rappels sans les recréer. */
  const equalsRef = useRef(equals);
  equalsRef.current = equals;

  const [snap, setSnap] = useState<Snapshot<T>>({
    past: [],
    present: initial,
    future: [],
    lastAt: 0,
  });

  const set = useCallback(
    (next: T | ((prev: T) => T), opts?: { coalesce?: boolean }) => {
      setSnap((s) => {
        const value =
          typeof next === 'function' ? (next as (prev: T) => T)(s.present) : next;
        if (equalsRef.current(value, s.present)) return s;

        const now = Date.now();
        // On ne regroupe que si une entrée existe déjà et que l'écart est court :
        // sinon la toute première modification serait absorbée par la précédente.
        const coalesce =
          opts?.coalesce === true && s.past.length > 0 && now - s.lastAt < coalesceMs;

        return {
          past: coalesce ? s.past : [...s.past, s.present].slice(-limit),
          present: value,
          future: [],
          lastAt: now,
        };
      });
    },
    [coalesceMs, limit],
  );

  const replace = useCallback((next: T | ((prev: T) => T)) => {
    setSnap((s) => {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(s.present) : next;
      if (equalsRef.current(value, s.present)) return s;
      return { ...s, present: value, lastAt: 0 };
    });
  }, []);

  const reset = useCallback((next: T) => {
    setSnap({ past: [], present: next, future: [], lastAt: 0 });
  }, []);

  const undo = useCallback(() => {
    setSnap((s) => {
      if (s.past.length === 0) return s;
      return {
        past: s.past.slice(0, -1),
        present: s.past[s.past.length - 1],
        future: [s.present, ...s.future],
        // 0 : la modification suivante ne doit pas se fondre dans l'annulation.
        lastAt: 0,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setSnap((s) => {
      if (s.future.length === 0) return s;
      return {
        past: [...s.past, s.present].slice(-limit),
        present: s.future[0],
        future: s.future.slice(1),
        lastAt: 0,
      };
    });
  }, [limit]);

  return {
    value: snap.present,
    set,
    replace,
    reset,
    undo,
    redo,
    canUndo: snap.past.length > 0,
    canRedo: snap.future.length > 0,
  };
}
