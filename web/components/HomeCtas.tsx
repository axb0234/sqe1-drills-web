'use client';

import Link from 'next/link';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from './AuthProvider';

export default function HomeCtas() {
  const { authenticated } = useContext(AuthContext);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !authenticated) return null;

  return (
    <div className="d-flex gap-3 mt-3">
      <Link href="/start" className="btn btn-primary btn-lg">Start a drill</Link>
      <Link href="/dashboard" className="btn btn-outline-secondary btn-lg">View dashboard</Link>
    </div>
  );
}
