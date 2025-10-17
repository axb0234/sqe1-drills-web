'use client';

import Keycloak, { KeycloakInitOptions } from 'keycloak-js';

let instance: Keycloak | null = null;

export function getKeycloak() {
  if (!instance) {
    instance = new Keycloak({
      url: process.env.NEXT_PUBLIC_KEYCLOAK_URL,
      realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM!,
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID!,
    });
  }
  return instance;
}

export const kcInitOptions: KeycloakInitOptions = {
  onLoad: 'check-sso',
  pkceMethod: 'S256',
  checkLoginIframe: false,
  redirectUri: typeof window !== 'undefined'
    ? window.location.origin + '/oauth/callback'
    : undefined,
};
