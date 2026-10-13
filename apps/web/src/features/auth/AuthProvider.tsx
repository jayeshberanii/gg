'use client';

import type { SessionUser } from '@gglib/shared';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '@/lib/api';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: SessionUser };

type AuthApi = AuthState & {
  signedIn: (user: SessionUser) => void;
  /** Ends the session; `recordLogoutTime` when the work report was closed without saving. */
  signOut: (recordLogoutTime: boolean) => Promise<void>;
};

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    api
      .get<{ user: SessionUser }>('/auth/me')
      .then(({ user }) => setState({ status: 'authenticated', user }))
      .catch(() => setState({ status: 'anonymous', user: null }));
  }, []);

  const signedIn = useCallback(
    (user: SessionUser) => setState({ status: 'authenticated', user }),
    [],
  );
  const signOut = useCallback(async (recordLogoutTime: boolean) => {
    try {
      await api.post('/auth/logout', { recordLogoutTime });
    } finally {
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  const value = useMemo(() => ({ ...state, signedIn, signOut }), [state, signedIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth needs AuthProvider');
  return ctx;
}
