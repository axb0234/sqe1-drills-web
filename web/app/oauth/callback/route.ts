import { NextRequest, NextResponse } from 'next/server';

/* Build public origin using X-Forwarded-* from the proxy (Caddy) */
function getExternalOrigin(req: NextRequest) {
  const xfProto = req.headers.get('x-forwarded-proto');
  const xfHost  = req.headers.get('x-forwarded-host');
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;
  const host = req.headers.get('host') || req.nextUrl.host;
  const proto = (req.nextUrl.protocol || 'https:').replace(/:$/, '');
  return `${proto}://${host}`;
}

/* KC config */
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

/* Minimal payload decode (no signature verification) */
function decodeJwt<T = any>(token: string): T {
  const payload = token.split('.')[1] || '';
  const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json);
}

const C_ID = 'sqe_id';
const C_RT = 'sqe_rt';
const C_UI = 'sqe_user';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const err  = url.searchParams.get('error');

  const publicOrigin = getExternalOrigin(req);           // <-- use forwarded origin
  const { base, realm, clientId } = cfg();

  if (err || !code) {
    console.error('OIDC callback error or missing code', { err, code, publicOrigin });
    return NextResponse.redirect(`${publicOrigin}/login?error=${err || 'missing_code'}`);
  }

  const redirectUri   = `${publicOrigin}/oauth/callback`; // <-- what KC expects
  const tokenEndpoint = `${base}/realms/${realm}/protocol/openid-connect/token`;

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,           // public client, no secret
  });

  const resp = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    cache: 'no-store',
  });

  let raw = '';
  try { raw = await resp.text(); } catch {}
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }

  if (!resp.ok) {
    console.error('KC token exchange failed', {
      status: resp.status,
      statusText: resp.statusText,
      tokenEndpoint,
      redirectUri,
      clientId,
      body,
    });
    return NextResponse.redirect(`${publicOrigin}/login?error=token`);
  }

  const { id_token, refresh_token, expires_in = 300, refresh_expires_in = 1800 } = body;

  const id = decodeJwt(id_token);
  const fullName = [id?.given_name, id?.family_name].filter(Boolean).join(' ');
  const name = (id?.name ?? fullName) || id?.preferred_username || '';

  const uiPayload = Buffer.from(JSON.stringify({
    sub: id?.sub,
    email: id?.email,
    name,
    email_verified: id?.email_verified ?? false,
  })).toString('base64');

  const res = NextResponse.redirect(`${publicOrigin}/dashboard`);
  res.cookies.set(C_ID, id_token,      { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: expires_in });
  if (refresh_token) {
    res.cookies.set(C_RT, refresh_token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: refresh_expires_in });
  }
  res.cookies.set(C_UI, uiPayload,     { httpOnly: false, secure: true, sameSite: 'lax', path: '/', maxAge: expires_in });

  return res;
}
