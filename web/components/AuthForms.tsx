'use client';

import { useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext } from './AuthProvider';

/* Build Keycloak URLs without SDK */
function cfg() {
  const issuer = process.env.NEXT_PUBLIC_AUTH_ISSUER; // e.g. https://auth.sqe1prep.com/realms/sqe
  const clientId = process.env.NEXT_PUBLIC_AUTH_CLIENT_ID
    ?? process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID
    ?? 'web';

  if (issuer) {
    const base = issuer.replace(/\/realms\/[^/]+\/?$/, '');
    const m = issuer.match(/\/realms\/([^/]+)\/?$/);
    return { base, realm: m?.[1] || 'sqe', clientId };
  }
  // Fallback defaults if envs missing
  return {
    base: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://auth.sqe1prep.com',
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'sqe',
    clientId,
  };
}

function makeAuthUrl(kind: 'login' | 'register', idpHint?: string) {
  const { base, realm, clientId } = cfg();
  const path = kind === 'register' ? 'registrations' : 'auth';
  const u = new URL(`${base}/realms/${realm}/protocol/openid-connect/${path}`);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', `${window.location.origin}/oauth/callback`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid');
  if (idpHint) u.searchParams.set('kc_idp_hint', idpHint);
  return u.toString();
}

export function LoginForm() {
  const router = useRouter();
  const { ready, authenticated } = useContext(AuthContext);

  // If already logged in, go to dashboard
  useEffect(() => {
    if (ready && authenticated) router.replace('/dashboard');
  }, [ready, authenticated, router]);

  const go = (url: string) => { window.location.href = url; };

  return (
    <div>
      <div className="mb-3">
        <button
          className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
          onClick={() => go(makeAuthUrl('login'))}
        >
          <i className="fa-solid fa-right-to-bracket" />
          <span>Login</span>
        </button>
      </div>

      <div className="text-center text-secondary small my-3">or</div>

      <div className="d-grid gap-2">
        <button
          className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2"
          onClick={() => go(makeAuthUrl('login','google'))}   // IdP alias must match Keycloak
        >
          <i className="fa-brands fa-google" />
          <span>Login with Google</span>
        </button>
        /*<button
          className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2"
          onClick={() => go(makeAuthUrl('login','microsoft'))} // IdP alias must match Keycloak
        >
          <i className="fa-brands fa-microsoft" />
          <span>Login with Microsoft</span>
        </button>*/
      </div>

      <div className="mt-3">
        <small className="text-muted">
          Forgot password? Use “Forgot password” on the next screen.
        </small>
      </div>
    </div>
  );
}

export function RegisterForm() {
  const go = (url: string) => { window.location.href = url; };

  return (
    <div className="d-grid">
      <button
        className="btn btn-success w-100 d-flex align-items-center justify-content-center gap-2"
        onClick={() => go(makeAuthUrl('register'))}
      >
        <i className="fa-solid fa-user-plus" />
        <span>Create account</span>
      </button>
      <div className="text-secondary small mt-2">
        By signing up you agree to our terms.
      </div>
    </div>
  );
}
