'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Lecture des API d'administration.
 *
 * Les pages passent par les routes `/api/admin/*` plutôt que par un appel
 * direct à la base : c'est la même porte que celle qu'un attaquant
 * essaierait d'utiliser, donc la garde est exercée en permanence au lieu
 * d'être contournée par un chemin plus court.
 */

export interface AdminQueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAdminData<T>(url: string | null): AdminQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(body?.error ?? `Réponse ${response.status}`);
        }
        return body as unknown as T;
      })
      .then((body) => {
        if (!cancelled) {
          setData(body);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Lecture impossible.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  return { data, loading, error, refresh };
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(date);
}

export function formatAmount(value: number, currency: string): string {
  return `${new Intl.NumberFormat('fr-FR').format(Number.isFinite(value) ? value : 0)} ${currency}`;
}
