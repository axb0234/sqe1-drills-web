'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';

type AuthState = { ready: boolean; authenticated: boolean };
export const AuthContext = createContext<AuthState>({ ready: false, authenticated: false });

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: false, authenticated: false });

  useEffect(() => {
    const read = () =>
      (typeof window !== 'undefined') &&
      (sessionStorage.getItem('kc-auth') === '1' || localStorage.getItem('kc-auth') === '1');

    const update = () => setState({ ready: true, authenticated: read() });

    update();
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
