'use client';

import Keycloak from 'keycloak-js';

const KC_URL =
  process.env.NEXT_PUBLIC_KEYCLOAK_URL ||
  (process.env.NEXT_PUBLIC_AUTH_ISSUER
    ? process.env.NEXT_PUBLIC_AUTH_ISSUER.replace(/\/realms\/[^/]+\/?$/, '')
    : 'https://auth.sqe1prep.com');

const KC_REALM =
  process.env.NEXT_PUBLIC_KEYCLOAK_REALM ||
  (process.env.NEXT_PUBLIC_AUTH_ISSUER
    ? (process.env.NEXT_PUBLIC_AUTH_ISSUER.match(/\/realms\/([^/]+)\/?$/)?.[1] ?? 'sqe')
    : 'sqe');

const KC_CLIENT_ID =
  process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ||
  process.env.NEXT_PUBLIC_AUTH_CLIENT_ID ||
  'web';

let instance: Keycloak | null = null;

export function getKeycloak() {
  if (typeof window === 'undefined') return null; // never init on server
  if (!instance) {
    instance = new Keycloak({ url: KC_URL, realm: KC_REALM, clientId: KC_CLIENT_ID });
  }
  return instance;
}
