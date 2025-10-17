'use client';

import { useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getKeycloak } from '../lib/kc';          // if your alias "@" isn't set, use: ../lib/kc
import { AuthContext } from './AuthProvider';    // same folder as this file

const kc = getKeycloak();

export function LoginForm() {
  const router = useRouter();
  const { ready, authenticated } = useContext(AuthContext);

  // If already logged in, go straight to dashboard
  useEffect(() => {
    if (ready && authenticated) router.replace('/dashboard');
  }, [ready, authenticated, router]);

  return (
    <div>
      <div className="mb-3">
        <button
          className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
          onClick={() => kc.login()}  // Keycloak hosted login (email + password)
        >
          <i className="fa-solid fa-right-to-bracket" />
          <span>Login</span>
        </button>
      </div>

      <div className="text-center text-secondary small my-3">or</div>

      <div className="d-grid gap-2">
        <button
          className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2"
          onClick={() => kc.login({ idpHint: 'google' })}  // alias must match your IdP alias
        >
          <i className="fa-brands fa-google" />
          <span>Login with Google</span>
        </button>

        <button
          className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2"
          onClick={() => kc.login({ idpHint: 'microsoft' })}  // alias must match your IdP alias
        >
          <i className="fa-brands fa-microsoft" />
          <span>Login with Microsoft</span>
        </button>
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
  return (
    <div className="d-grid">
      <button
        className="btn btn-success w-100 d-flex align-items-center justify-content-center gap-2"
        onClick={() => kc.register()} // Keycloak hosted registration (name, email, password)
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
