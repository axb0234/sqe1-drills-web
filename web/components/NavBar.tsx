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

  const logout = () => {
    localStorage.removeItem('auth');
    window.location.href = '/';
  };

  return (
    <nav className="navbar navbar-expand-lg bg-white border-bottom">
      <div className="container">
        <Link className="navbar-brand fw-bold d-flex align-items-center gap-2" href="/">
          <i className="fa-solid fa-graduation-cap"></i>
          <span><b>SQE1</b> Drills</span>
        </Link>

        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav"
          aria-controls="nav" aria-expanded="false" aria-label="Toggle navigation">
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="nav">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            <li className="nav-item">
              <Link className="nav-link d-flex align-items-center gap-2" href="/dashboard">
                <i className="fa-solid fa-gauge"></i> <span>Dashboard</span>
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link d-flex align-items-center gap-2" href="/start">
                <i className="fa-solid fa-circle-play"></i> <span>Start Drill</span>
              </Link>
            </li>
            <li className="nav-item">
              <Link className="nav-link d-flex align-items-center gap-2" href="/billing">
                <i className="fa-solid fa-credit-card"></i> <span>Billing</span>
              </Link>
            </li>
          </ul>

          <div className="d-flex gap-2">
            {!authed ? (
              <Link className="btn btn-outline-primary d-flex align-items-center gap-2" href="/login">
                <i className="fa-solid fa-right-to-bracket"></i> <span>Sign in</span>
              </Link>
            ) : (
              <button className="btn btn-outline-secondary d-flex align-items-center gap-2" onClick={logout}>
                <i className="fa-solid fa-right-from-bracket"></i> <span>Logout</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
