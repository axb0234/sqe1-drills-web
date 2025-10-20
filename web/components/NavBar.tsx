'use client';

import Link from 'next/link';
import { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './AuthProvider';

function readCookieAuth() {
  if (typeof document === 'undefined') return false;
  return document.cookie.includes('sqe_user=');
}

export default function NavBar() {
  const { authenticated: ctxAuthed } = useContext(AuthContext);
  const [cookieAuthed, setCookieAuthed] = useState<boolean>(readCookieAuth());

  useEffect(() => {
    const t = () => setCookieAuthed(readCookieAuth());
    t();
    const onVis = () => document.visibilityState === 'visible' && t();
    window.addEventListener('visibilitychange', onVis);
    const i = setInterval(t, 1000); // very light polling to avoid race during first paint
    return () => { window.removeEventListener('visibilitychange', onVis); clearInterval(i); };
  }, []);

  const isAuthed = ctxAuthed || cookieAuthed;

  // DEBUG
  useEffect(() => {
    console.log('[NavBar] ctxAuthed=', ctxAuthed, 'cookieAuthed=', cookieAuthed, 'isAuthed=', isAuthed);
  }, [ctxAuthed, cookieAuthed, isAuthed]);

  const logout = () => {
    window.location.href = '/api/auth/logout';
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
          {isAuthed && (
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
          )}

          <div className="ms-auto d-flex gap-2">
            {!isAuthed ? (
              <Link className="btn btn-outline-primary d-flex align-items-center gap-2" href="/login">
                <i className="fa-solid fa-right-to-bracket"></i> <span>Sign in</span>
              </Link>
            ) : (
              <button className="btn btn-outline-secondary d-flex align-items-center gap-2" onClick={logout}>
                <i className="fa-solid fa-right-from-bracket"></i> <span>Sign out</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
