'use client';

import Link from 'next/link';
import { useContext, useMemo } from 'react';
import { AuthContext } from './AuthProvider';

function kcCfg() {
  const issuer = process.env.NEXT_PUBLIC_AUTH_ISSUER;
  const clientId =
    process.env.NEXT_PUBLIC_AUTH_CLIENT_ID ??
    process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ??
    'web';

  if (issuer) {
    const base = issuer.replace(/\/realms\/[^/]+\/?$/, '');
    const m = issuer.match(/\/realms\/([^/]+)\/?$/);
    return { base, realm: m?.[1] || 'sqe', clientId };
  }
  return {
    base: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://auth.sqe1prep.com',
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'sqe',
    clientId,
  };
}

export default function NavBar() {
  const { authenticated } = useContext(AuthContext);
  const { base, realm, clientId } = useMemo(kcCfg, []);

  const logout = () => {
    // clear UI flag first
    sessionStorage.removeItem('kc-auth');
    localStorage.removeItem('kc-auth');

    // RP-initiated logout at Keycloak then back home
    const u = new URL(`${base}/realms/${realm}/protocol/openid-connect/logout`);
    u.searchParams.set('client_id', String(clientId));
    u.searchParams.set('post_logout_redirect_uri', `${window.location.origin}/`);
    window.location.href = u.toString();
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
          {authenticated && (
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
            {!authenticated ? (
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
