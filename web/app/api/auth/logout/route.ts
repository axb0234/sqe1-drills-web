import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getExternalOrigin(req: NextRequest) {
  const xfProto = req.headers.get('x-forwarded-proto');
  const xfHost  = req.headers.get('x-forwarded-host');
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`;
  const host = req.headers.get('host') || req.nextUrl.host;
  const proto = (req.nextUrl.protocol || 'https:').replace(/:$/, '');
  return `${proto}://${host}`;
}

function cfg() {
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

export async function GET(req: NextRequest) {
  const publicOrigin = getExternalOrigin(req);                 // <-- use forwarded origin
  const { base, realm, clientId } = cfg();

  const kcLogout = new URL(`${base}/realms/${realm}/protocol/openid-connect/logout`);
  kcLogout.searchParams.set('client_id', clientId);
  kcLogout.searchParams.set('post_logout_redirect_uri', `${publicOrigin}/`);

  const res = NextResponse.redirect(kcLogout.toString());
  ['sqe_id', 'sqe_rt', 'sqe_user'].forEach((c: string) =>
    res.cookies.set(c, '', { path: '/', maxAge: 0 }),
  );
  return res;
}
