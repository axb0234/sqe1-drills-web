'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OAuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const url = new URL(window.location.href);
    const hasError = url.searchParams.get('error');
    const hasCode = !!url.searchParams.get('code');

    if (hasError) {
      // ensure UI shows logged-out state and bounce to login
      sessionStorage.removeItem('kc-auth');
      localStorage.removeItem('kc-auth');
      router.replace('/login');
      return;
    }

    if (hasCode) {
      // we reached here after a successful Keycloak redirect — flip the UI flag
      sessionStorage.setItem('kc-auth', '1');
      localStorage.setItem('kc-auth', '1');
      // clean up URL then go to dashboard
      history.replaceState(null, '', '/oauth/callback');
      router.replace('/dashboard');
      return;
    }

    // fallback
    router.replace('/');
  }, [router]);

  return <div className="container py-5">Completing sign-in…</div>;
}
