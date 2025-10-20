import { NextRequest, NextResponse } from 'next/server';

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
  const { base, realm, clientId } = cfg();
  const { origin } = req.nextUrl;

  const logoutUrl = new URL(`${base}/realms/${realm}/protocol/openid-connect/logout`);
  logoutUrl.searchParams.set('client_id', clientId);
  logoutUrl.searchParams.set('post_logout_redirect_uri', origin + '/');

  const res = NextResponse.redirect(logoutUrl.toString());
  // Clear our cookies
  ['sqe_id', 'sqe_rt', 'sqe_user'].forEach((c) =>
    res.cookies.set(c, '', { path: '/', maxAge: 0 })
  );
  return res;
}
