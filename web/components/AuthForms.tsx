'use client';

import { useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext } from './AuthProvider';
import { getKeycloak } from '../lib/kc';

function doLogin(idpHint?: string) {
  const kc = getKeycloak();
  if (!kc) { alert('Auth is loading. Please try again.'); return; }
  kc.login(idpHint ? { idpHint } : undefined);  // PKCE handled automatically
}

function doRegister() {
  const kc = getKeycloak();
  if (!kc) { alert('Auth is loading. Please try again.'); return; }
  kc.register();
}

export function LoginForm() {
  const router = useRouter();
  const { ready, authenticated } = useContext(AuthContext);

  useEffect(() => {
    if (ready && authenticated) router.replace('/dashboard');
  }, [ready, authenticated, router]);

  return (
    <div>
      <div className="mb-3">
        <button
          className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
          onClick={() => doLogin()}
        >
          <i className="fa-solid fa-right-to-bracket" />
          <span>Login</span>
        </button>
      </div>

      <div className="text-center text-secondary small my-3">or</div>

      <div className="d-grid gap-2">
        <button
          className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2"
          onClick={() => doLogin('google')}
        >
          <i className="fa-brands fa-google" />
          <span>Login with Google</span>
        </button>
        <button
          className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2"
          onClick={() => doLogin('microsoft')}
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
        onClick={() => doRegister()}
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
