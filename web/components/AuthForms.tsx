'use client';

import { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext } from './AuthProvider';

// Lazily load keycloak-js helper and ensure init with PKCE
async function withKC(run: (kc: any) => void | Promise<void>) {
  try {
    // dynamic import ensures this only runs in the browser
    const mod = await import('../lib/kc');
    const kc = mod.getKeycloak();
    if (!kc) throw new Error('Keycloak not available (SSR)');

    // make sure it's initialised once with PKCE before any action
    // we stash a flag on the instance to avoid double-initting
    // @ts-ignore
    if (!kc.__inited) {
      await kc.init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        redirectUri: window.location.origin + '/oauth/callback',
      });
      // @ts-ignore
      kc.__inited = true;
    }

    await run(kc);
  } catch (e) {
    console.error(e);
    alert('Authentication is starting up. Please try again in a moment.');
  }
}

export function LoginForm() {
  const router = useRouter();
  const { ready, authenticated } = useContext(AuthContext);
  const [busy, setBusy] = useState(false);

  // already logged in? go to dashboard
  useEffect(() => {
    if (ready && authenticated) router.replace('/dashboard');
  }, [ready, authenticated, router]);

  const clickLogin = () => withKC(kc => kc.login());
  const clickGoogle = () => withKC(kc => kc.login({ idpHint: 'google' }));       // alias must match Keycloak
  const clickMs     = () => withKC(kc => kc.login({ idpHint: 'microsoft' }));    // alias must match Keycloak

  return (
    <div>
      <div className="mb-3">
        <button
          className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
          onClick={clickLogin}
          disabled={busy}
        >
          <i className="fa-solid fa-right-to-bracket" />
          <span>Login</span>
        </button>
      </div>

      <div className="text-center text-secondary small my-3">or</div>

      <div className="d-grid gap-2">
        <button
          className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2"
          onClick={clickGoogle}
          disabled={busy}
        >
          <i className="fa-brands fa-google" />
          <span>Login with Google</span>
        </button>
        <button
          className="btn btn-outline-secondary d-flex align-items-center justify-content-center gap-2"
          onClick={clickMs}
          disabled={busy}
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
  const [busy, setBusy] = useState(false);

  const clickRegister = () => withKC(kc => kc.register());

  return (
    <div className="d-grid">
      <button
        className="btn btn-success w-100 d-flex align-items-center justify-content-center gap-2"
        onClick={clickRegister}
        disabled={busy}
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
