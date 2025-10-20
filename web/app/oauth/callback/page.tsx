'use client';

import { useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// ⬇️ use a relative path (this file is at app/oauth/callback/page.tsx)
import { AuthContext } from '../../../components/AuthProvider';

export default function OAuthCallback() {
  const router = useRouter();
  const { ready, authenticated } = useContext(AuthContext);

  useEffect(() => {
    // wait for kc.init to finish, then route
    if (!ready) return;
    if (authenticated) router.replace('/dashboard');
    else router.replace('/login');
  }, [ready, authenticated, router]);

  return <div className="container py-5">Completing sign-in…</div>;
}
