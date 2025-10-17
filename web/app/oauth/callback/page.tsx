'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OAuthCallback() {
  const router = useRouter();
  useEffect(() => {
    // Keycloak processes the URL automatically via kc.init(); we just send users home
    const t = setTimeout(() => router.replace('/'), 200);
    return () => clearTimeout(t);
  }, [router]);
  return <div className="container py-5">Completing sign-in…</div>;
}
