'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './AuthProvider';

export default function UserGreeting({ className = '' }: { className?: string }) {
  const { user } = useContext(AuthContext);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const salutation = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (!mounted || !user) return null;

  const name = user.name || user.email || 'there';

  return (
    <div className={`alert alert-light border d-flex align-items-center gap-2 ${className}`} role="status">
      <i className="fa-regular fa-face-smile"></i>
      <div><strong>{salutation}, {name}!</strong></div>
    </div>
  );
}
