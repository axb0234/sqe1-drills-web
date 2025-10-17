'use client';

import Keycloak from 'keycloak-js';

function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    // Helpful error if someone builds without the required envs
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

let instance: Keycloak | null = null;

export function getKeycloak() {
  if (!instance) {
    instance = new Keycloak({
      url: req('NEXT_PUBLIC_KEYCLOAK_URL'),
      realm: req('NEXT_PUBLIC_KEYCLOAK_REALM'),
      clientId: req('NEXT_PUBLIC_KEYCLOAK_CLIENT_ID'),
    });
  }
  return instance;
}
