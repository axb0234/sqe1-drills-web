# SQE1 Drills — Web (Next.js + Bootstrap 5)

Self-hosted web UI for the SQE1 drills MVP.

## Pages

* `/` (Landing)
* `/login`
* `/dashboard`
* `/start`
* `/drill/[sid]`
* `/history`
* `/billing`
* `/oauth/callback` (server route — OIDC code exchange)
* `/api/auth/logout` (server route — clears cookies + KC logout)

---

## Tech & Auth Overview

* **Framework:** Next.js 14 (App Router) + Bootstrap 5
* **Auth:** Keycloak (realm **`sqe`**, client **`web`**)
  We use **server-side Authorization Code flow** (no keycloak-js on the client):

  * Keycloak redirects to `/oauth/callback?code=…`
  * The route handler exchanges the code for tokens and sets cookies:

    * `sqe_user` (non-HttpOnly) — Base64 JSON: `{ sub, email, name, email_verified }`
    * `sqe_id` (HttpOnly) — ID token (opaque to the client)
    * `sqe_rt` (HttpOnly) — Refresh token (if present)
  * UI reads `sqe_user` to toggle the navbar and greetings.
  * **Logout**: `/api/auth/logout` clears cookies and does a front-channel Keycloak logout, then returns to `/`.

> `sub` is the stable Keycloak user id (subject). Use it as your local user’s primary key/foreign key.

---

## Dev machine (Cursor/VS Code)

1. Install **Node 20+** and **Git**.
2. `cd web && npm i`
3. Create env for web:

   ```bash
   # web/.env.local (for dev) – adjust issuer if testing locally
   NEXT_PUBLIC_AUTH_ISSUER=https://auth.sqe1prep.com/realms/sqe
   NEXT_PUBLIC_AUTH_CLIENT_ID=web
   ```

   > If you want Google/Keycloak login to work on localhost, add these in Keycloak client **web**:
   >
   > * **Valid redirect URIs**: `http://localhost:3000/oauth/callback`
   > * **Web origins**: `http://localhost:3000`
4. `npm run dev` → [http://localhost:3000](http://localhost:3000)

---

## Server deploy (Docker + Caddy)

First deploy:

```bash
sudo mkdir -p /srv/sqe1prep/app
cd /srv/sqe1prep/app
git clone https://github.com/<you>/sqe1-drills-web.git .
docker network create sqe1prep_default || true
docker compose --project-name sqe1prep -f docker-compose.yml up -d --build web
```

Append `ops/Caddyfile.addon` to your main Caddyfile and reload:

```bash
docker compose --project-name sqe1prep exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Pull updates later:

```bash
# dev
git push origin main
# server
/srv/sqe1prep/app/deploy/pull.sh
```

> We commit `web/package-lock.json` so Docker can use `npm ci` for reproducible builds.

---

## Keycloak configuration (realm: `sqe`, client: `web`)

**Client (web):**

* **Public client** (Client authentication: **Off**)
* **Standard flow**: **On**
* **PKCE**: **None** (we’re not sending a verifier)
* **Valid redirect URIs**:

  * `https://sqe1prep.com/oauth/callback`
  * (optional for dev) `http://localhost:3000/oauth/callback`
* **Valid post logout redirect URIs**:

  * `https://sqe1prep.com/`
  * (optional for dev) `http://localhost:3000/`
* **Web origins**:

  * `https://sqe1prep.com`
  * (optional for dev) `http://localhost:3000`
* **Advanced** (optional):

  * **Always use lightweight access token**: **On** (smaller access tokens)

**Default client scopes:** ensure **`profile`** and **`email`** are attached to the client (so `id_token` has `email`, `given_name`, `family_name`, etc.).

**Identity Providers:**

* **Google**:

  * Redirect URI in Google: `https://auth.sqe1prep.com/realms/sqe/broker/google/endpoint`
  * Scopes: `openid profile email`
  * **Hosted Domain**: leave **blank** (or set a Workspace domain to restrict)
* **Microsoft**: currently disabled (enable later; redirect URI: `…/broker/microsoft/endpoint`)

---

## Where to tweak the UI / Auth

```
web/
  app/
    oauth/
      callback/route.ts        # OIDC code→token exchange, sets cookies, redirects
    api/
      auth/logout/route.ts     # Clears cookies; redirects to Keycloak logout with post_logout_redirect_uri
    page.tsx                   # Landing page (uses <HomeCtas/> when authed)
    dashboard/page.tsx         # Shows <UserGreeting/>
    start/page.tsx             # Shows <UserGreeting/>
    drill/[sid]/page.tsx
    history/page.tsx
    billing/page.tsx           # Shows <UserGreeting/>
    layout.tsx                 # Wraps app in <Providers/>, renders <NavBar/> and <Footer/>
  components/
    Providers.tsx              # Wraps app with AuthProvider
    AuthProvider.tsx           # Reads sqe_user cookie → { ready, authenticated, user }
    NavBar.tsx                 # Hides/Shows links based on auth; Sign out → /api/auth/logout
    HomeCtas.tsx               # Landing page CTAs shown only when authenticated
    UserGreeting.tsx           # Friendly greeting bar with user.name/email
  lib/
    kc.ts                      # (kept minimal; not used in current flow)
    # (Optional helper suggested below) user.ts
```

---

## Getting the logged-in user (client & server)

### Client components

Read from context anywhere:

```tsx
import { useContext } from 'react';
import { AuthContext } from '../components/AuthProvider';

const { authenticated, user } = useContext(AuthContext);
// user: { sub, email, name, email_verified }
```

### Server routes / actions

Read cookies and link to your DB using `sub`. You can add this helper:

```ts
// web/lib/user.ts
export type UiUser = { sub: string; email?: string; name?: string; email_verified?: boolean };

import { cookies } from 'next/headers';

export function readServerUser(): UiUser | undefined {
  const v = cookies().get('sqe_user')?.value;
  if (!v) return;
  try {
    const json = Buffer.from(decodeURIComponent(v), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch { return; }
}
```

Usage in a route:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { readServerUser } from '@/lib/user';

export async function POST(req: NextRequest) {
  const u = readServerUser();
  if (!u?.sub) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const payload = await req.json();
  // await db.upsert({ userId: u.sub, ...payload });
  return NextResponse.json({ ok: true });
}
```

---

## Troubleshooting (quick)

* **After logout: “Invalid redirect uri” (Keycloak)**
  Add `https://sqe1prep.com/` to **Valid post logout redirect URIs**.
* **After login: `/login?error=token`**
  Your app built `redirect_uri` as `http://localhost:3000/oauth/callback`.
  We fixed this by deriving the public origin from `X-Forwarded-Proto/Host`.
  Ensure client **web** has `https://sqe1prep.com/oauth/callback` allowed.
* **Google: “Identity token does not contain hosted domain parameter.”**
  Clear **Hosted Domain** in the Google IdP (or sign in with a Workspace account from that domain).
* **Hydration warnings in navbar**
  We render a minimal navbar until the client mounts; warnings are gone.

---

## Context (assistant quick-start)

> Paste this block when you start a new session with me.

* **Repo:** [https://github.com/](https://github.com/)<you>/sqe1-drills-web
* **Domain:** [https://sqe1prep.com](https://sqe1prep.com)
* **Auth:** Keycloak (realm=`sqe`, client=`web`, issuer=`https://auth.sqe1prep.com/realms/sqe`)
* **Cookies:** `sqe_user` (b64 JSON: `{sub,email,name}`), `sqe_id` (HttpOnly id_token), `sqe_rt` (HttpOnly refresh)
* **Key files:**

  * `app/oauth/callback/route.ts` — code→token exchange, sets cookies
  * `app/api/auth/logout/route.ts` — clears cookies + KC logout
  * `components/AuthProvider.tsx` — reads `sqe_user` → context
  * `components/NavBar.tsx` — authed links + Sign out
  * `components/HomeCtas.tsx` — landing CTAs when authed
  * `components/UserGreeting.tsx` — greeting bar
* **Note:** I (the assistant) won’t push to your repo; I’ll provide diffs/edits and you apply them.


