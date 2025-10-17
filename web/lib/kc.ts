'use client';

import Keycloak from 'keycloak-js';

function must(name: string, v?: string | null): string {
  if (!v || v.trim() === '') throw new Error(`Missing required env: ${name}`);
  return v;
}

function fromIssuer(issuer: string) {
  // issuer: https://auth.example.com/realms/<realm>
  const base = issuer.replace(/\/realms\/[^/]+\/?$/, '');
  const m = issuer.match(/\/realms\/([^/]+)\/?$/);
  const realm = m?.[1];
  if (!base || !realm) throw new Error(`Invalid NEXT_PUBLIC_AUTH_ISSUER: ${issuer}`);
  return { url: base, realm };
}

function getCfg() {
  const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID
    ?? process.env.NEXT_PUBLIC_AUTH_CLIENT_ID;

  if (process.env.NEXT_PUBLIC_KEYCLOAK_URL && process.env.NEXT_PUBLIC_KEYCLOAK_REALM) {
    return {
      url: must('NEXT_PUBLIC_KEYCLOAK_URL', process.env.NEXT_PUBLIC_KEYCLOAK_URL),
      realm: must('NEXT_PUBLIC_KEYCLOAK_REALM', process.env.NEXT_PUBLIC_KEYCLOAK_REALM),
      clientId: must('NEXT_PUBLIC_KEYCLOAK_CLIENT_ID / NEXT_PUBLIC_AUTH_CLIENT_ID', clientId),
    };
  }

  const issuer = process.env.NEXT_PUBLIC_AUTH_ISSUER;
  if (issuer) {
    const { url, realm } = fromIssuer(issuer);
    return {
      url,
      realm,
      clientId: must('NEXT_PUBLIC_AUTH_CLIENT_ID', clientId),
    };
  }

  throw new Error(
    'Set NEXT_PUBLIC_KEYCLOAK_URL, NEXT_PUBLIC_KEYCLOAK_REALM, NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ' +
    'or set NEXT_PUBLIC_AUTH_ISSUER and NEXT_PUBLIC_AUTH_CLIENT_ID.'
  );
}

let instance: Keycloak | null = null;

export function getKeycloak() {
  if (!instance) {
    const { url, realm, clientId } = getCfg();
    instance = new Keycloak({ url, realm, clientId });
  }
  return instance;
}
