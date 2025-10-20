import { NextRequest, NextResponse } from 'next/server';

/* ---- KC config from env ---- */
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

/* ---- minimal JWT decode (payload only) ---- */
function decodeJwt<T = any>(token: string): T {
  const payload = token.split('.')[1] || '';
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(normalized, 'base64').toString('utf8');
  return JSON.parse(json);
}

const C_ID = 'sqe_id';
const C_RT = 'sqe_rt';
const C_UI = 'sqe_user';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const err  = searchParams.get('error');

  if (err) {
    console.error('OIDC callback error:', err);
    return NextResponse.redirect(new URL('/login?error=oidc', origin));
  }
  if (!code) {
    console.error('OIDC callback missing code');
    return NextResponse.redirect(new URL('/login?error=missing_code', origin));
  }

  const { base, realm, clientId } = cfg();
  const tokenEndpoint = `${base}/realms/${realm}/protocol/openid-connect/token`;
  const redirectUri   = `${origin}/oauth/callback`;

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
    console.error('KC token exchange failed:', body);
    return NextResponse.redirect(new URL('/login?error=token', origin));
  }

  const {
    id_token,
    refresh_token,
    expires_in = 300,
    refresh_expires_in = 1800,
  } = body as any;

  // Parse ID token → extract identity
  const id = decodeJwt(id_token);
  const fullName = [id?.given_name, id?.family_name].filter(Boolean).join(' ');
  // IMPORTANT: parenthesize when mixing ?? and ||
  const name =
    (id?.name ?? fullName) ||
    id?.preferred_username ||
    '';
  const uiPayload = Buffer.from(
    JSON.stringify({
      sub: id?.sub,
      email: id?.email,
      name,
      email_verified: id?.email_verified ?? false,
    })
  ).toString('base64');

  const res = NextResponse.redirect(new URL('/dashboard', origin));
  // HttpOnly cookies
  res.cookies.set(C_ID, id_token,     { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: expires_in });
  if (refresh_token) {
    res.cookies.set(C_RT, refresh_token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: refresh_expires_in });
  }
  // UI cookie (readable by client)
  res.cookies.set(C_UI, uiPayload,    { httpOnly: false, secure: true, sameSite: 'lax', path: '/', maxAge: expires_in });

  return res;
}
