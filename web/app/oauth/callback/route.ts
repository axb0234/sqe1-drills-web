import { NextRequest, NextResponse } from 'next/server';

/* ---- KC config derived from env ---- */
function cfg() {
  const issuer = process.env.NEXT_PUBLIC_AUTH_ISSUER; // e.g. https://auth.sqe1prep.com/realms/sqe
  const clientId =
    process.env.NEXT_PUBLIC_AUTH_CLIENT_ID ??
    process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ??
    'web';

  if (issuer) {
    const base = issuer.replace(/\/realms\/[^/]+\/?$/, '');
    const m = issuer.match(/\/realms\/([^/]+)\/?$/);
    const realm = m?.[1] || 'sqe';
    return { base, realm, clientId };
  }
  return {
    base: process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'https://auth.sqe1prep.com',
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'sqe',
    clientId,
  };
}

/* ---- minimal JWT decoder (no signature verification) ---- */
function decodeJwt<T = any>(token: string): T {
  const payload = token.split('.')[1];
  const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json);
}

// cookie names
const C_ID = 'sqe_id';     // HttpOnly id_token (for future server needs)
const C_RT = 'sqe_rt';     // HttpOnly refresh_token (if present)
const C_UI = 'sqe_user';   // non-HttpOnly user summary for UI (base64 JSON)

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const err  = searchParams.get('error');
  if (err)   return NextResponse.redirect(new URL('/login?error=oidc', origin));
  if (!code) return NextResponse.redirect(new URL('/login?error=missing_code', origin));

  const { base, realm, clientId } = cfg();
  const tokenEndpoint = `${base}/realms/${realm}/protocol/openid-connect/token`;
  const redirectUri = `${origin}/oauth/callback`;

  // Exchange code for tokens (public client: no secret)
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
  });

  const resp = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    cache: 'no-store',
  });

  const body = await resp.json().catch(() => ({} as any));

  if (!resp.ok) {
    console.error('KC token error', body);
    return NextResponse.redirect(new URL('/login?error=token', origin));
  }

  const { id_token, access_token, refresh_token, expires_in = 300, refresh_expires_in = 1800 } = body as any;

  // Extract user identity from ID token
  const id = decodeJwt(id_token);
  const name = id.name ?? [id.given_name, id.family_name].filter(Boolean).join(' ') || id.preferred_username || '';
  const uiPayload = Buffer.from(JSON.stringify({
    sub: id.sub, email: id.email, name, email_verified: id.email_verified ?? false,
  })).toString('base64');

  const res = NextResponse.redirect(new URL('/dashboard', origin));
  // HttpOnly cookies (not readable by JS)
  res.cookies.set(C_ID, id_token,     { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: expires_in });
  if (refresh_token) {
    res.cookies.set(C_RT, refresh_token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: refresh_expires_in });
  }
  // UI cookie with user summary (readable by the client)
  res.cookies.set(C_UI, uiPayload,    { httpOnly: false, secure: true, sameSite: 'lax', path: '/', maxAge: expires_in });

  return res;
}
