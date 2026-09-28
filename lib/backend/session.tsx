'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@/lib/types';
import { backend } from './index';

interface SessionValue {
  user: User | null;
  loading: boolean;
  /** Recharge le profil depuis la source (après un onboarding, une mise à jour…). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    void backend.getSessionUser().then((u) => {
      if (!alive) return;
      setUser(u);
      setLoading(false);
    });

    const unsubscribe = backend.onAuthStateChange((u) => {
      if (alive) setUser(u);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    setUser(await backend.getSessionUser());
  }, []);

  const signOut = useCallback(async () => {
    await backend.signOut();
    setUser(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ user, loading, refresh, signOut }),
    [user, loading, refresh, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
