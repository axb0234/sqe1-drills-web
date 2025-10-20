'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';

type User = { sub: string; email?: string; name?: string; email_verified?: boolean };
type AuthState = { ready: boolean; authenticated: boolean; user?: User };

export const AuthContext = createContext<AuthState>({ ready: false, authenticated: false });

function readUserCookie(): User | undefined {
  if (typeof document === 'undefined') return;
  const m = document.cookie.match(/(?:^|;\s*)sqe_user=([^;]+)/);
  if (!m) return;
  try {
    const json = atob(decodeURIComponent(m[1]));
    return JSON.parse(json);
  } catch { return; }
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: false, authenticated: false });

  const refresh = () => {
    const user = readUserCookie();
    setState({ ready: true, authenticated: !!user, user });
  };

  useEffect(() => {
    refresh();
    const onVis = () => document.visibilityState === 'visible' && refresh();
    const onStore = () => refresh();
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('storage', onStore);
    return () => {
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('storage', onStore);
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
