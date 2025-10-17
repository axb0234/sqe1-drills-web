'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { getKeycloak } from '../lib/kc';

type AuthState = { ready: boolean; authenticated: boolean };
export const AuthContext = createContext<AuthState>({ ready: false, authenticated: false });

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: false, authenticated: false });

  useEffect(() => {
    const kc = getKeycloak();
    kc.init({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      checkLoginIframe: false,
      redirectUri: window.location.origin + '/oauth/callback',
    })
      .then((authenticated) => {
        kc.onTokenExpired = async () => {
          try { await kc.updateToken(30); } catch { kc.login(); }
        };
        setState({ ready: true, authenticated });
      })
      .catch(() => setState({ ready: true, authenticated: false }));
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
