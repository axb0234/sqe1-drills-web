'use client';

import { useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext } from './AuthProvider';

async function loginViaKeycloak(idpHint?: string) {
  const { getKeycloak } = await import('../lib/kc'); // dynamic import = only in browser
  const kc = getKeycloak();
  kc.login(idpHint ? { idpHint } : undefined);       // adds PKCE automatically
}

async function registerViaKeycloak() {
  const { getKeycloak } = await import('../lib/kc');
  const kc = getKeycloak();
  kc.register();                                     // PKCE handled by SDK
}

export function LoginForm() {
  const router = useRouter();
  const { ready, authenticated } = useContext(AuthContext);

  // if already logged in, jump to dashboard
  useEffect(() => {
    if (ready && authenticated) router.replace('/dashboard');
  }, [ready, authenticated, router]);

  return (
    <div>
      <div className="mb-3">
        <button
          className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
          onClick={() => loginViaKeycloak()}
        >
          <i className="fa-solid fa-right-to-bracket" />
          <span>Login</span>
        </button>
      </div>

      <div className="text-center text-secondary small my-3">or</div>

      <div className="d-grid gap-2">
        <button
          className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2"
          onClick={() => loginViaKeycloak('google')}   // IdP alias must match Keycloak
        >
          <i className="fa-brands fa-google" />
          <span>Login with Google</span>
        </button>
        <button
          className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2"
          onClick={() => loginViaKeycloak('microsoft')} // IdP alias must match Keycloak
        >
          <i className="fa-brands fa-microsoft" />
          <span>Login with Microsoft</span>
        </button>
      </div>

      <div className="mt-3">
        <small className="text-muted">Forgot password? Use “Forgot password” on the next screen.</small>
      </div>
    </div>
  );
}

export function RegisterForm() {
  return (
    <div className="d-grid">
      <button
        className="btn btn-success w-100 d-flex align-items-center justify-content-center gap-2"
        onClick={() => registerViaKeycloak()}
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
