'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { getKeycloak } from '../lib/kc';

type AuthState = { ready: boolean; authenticated: boolean; id?: any };
export const AuthContext = createContext<AuthState>({ ready: false, authenticated: false });

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: false, authenticated: false });

  useEffect(() => {
    const kc = getKeycloak();
    if (!kc) { setState({ ready: true, authenticated: false }); return; }

    kc.init({
      onLoad: 'check-sso',
      checkLoginIframe: false,
      // Let keycloak-js do a silent redirect in an iframe to detect SSO:
      silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
      // We disabled PKCE on the Keycloak client, so don't force it here:
      pkceMethod: undefined,   // or just remove this line
      flow: 'standard',
    })
      .then((authenticated) => {
        // Keep tokens fresh
        kc.onTokenExpired = async () => {
          try { await kc.updateToken(30); } catch { kc.login(); }
        };

        // Expose parsed ID token for the app (user id, email, names)
        // Now you can read window.kc.idTokenParsed in dev tools
        if (typeof window !== 'undefined') (window as any).kc = kc;

        setState({
          ready: true,
          authenticated,
          id: kc.idTokenParsed || kc.tokenParsed, // contains sub, email, given_name, family_name, preferred_username
        });
      })
      .catch((err) => {
        console.error('kc.init failed', err);
        setState({ ready: true, authenticated: false });
      });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
