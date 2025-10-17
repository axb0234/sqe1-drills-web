'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function NavBar() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    const t = () => setAuthed(typeof window !== 'undefined' && localStorage.getItem('auth') === '1');
    t();
    window.addEventListener('storage', t);
    return () => window.removeEventListener('storage', t);
  }, []);

  const logout = () => { localStorage.removeItem('auth'); window.location.href = '/'; };

  return (
    <nav className="navbar navbar-expand-lg bg-white border-bottom">
      <div className="container">
        <Link className="navbar-brand fw-bold" href="/"><b>SQE1</b> Drills</Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="nav">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            <li className="nav-item"><Link className="nav-link" href="/dashboard">Dashboard</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/start">Start Drill</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/billing">Billing</Link></li>
          </ul>
          <div className="d-flex gap-2">
            {!authed
              ? <Link className="btn btn-outline-primary" href="/login">Sign in</Link>
              : <button className="btn btn-outline-secondary" onClick={logout}>Logout</button>}
          </div>
        </div>
      </div>
    </nav>
  );
}
