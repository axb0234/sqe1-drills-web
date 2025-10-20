'use client';

import { useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext } from '@/components/AuthProvider';

export default function OAuthCallback() {
  const router = useRouter();
  const { ready, authenticated } = useContext(AuthContext);

  useEffect(() => {
    // Wait for kc.init() to complete. Only then decide where to go.
    if (!ready) return;
    if (authenticated) router.replace('/dashboard');
    else router.replace('/login');
  }, [ready, authenticated, router]);

  return <div className="container py-5">Completing sign-in…</div>;
}
