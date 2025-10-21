// web/lib/user.ts
// CLIENT: get current user from sqe_user cookie (used inside components)
export type UiUser = { sub: string; email?: string; name?: string; email_verified?: boolean };

export function readClientUser(): UiUser | undefined {
  if (typeof document === 'undefined') return;
  const m = document.cookie.match(/(?:^|;\s*)sqe_user=([^;]+)/);
  if (!m) return;
  try {
    const json = atob(decodeURIComponent(m[1]));
    return JSON.parse(json);
  } catch { return; }
}

// SERVER (route handlers/actions): parse sqe_user from request cookies
import { cookies } from 'next/headers';

export function readServerUser(): UiUser | undefined {
  const v = cookies().get('sqe_user')?.value;
  if (!v) return;
  try {
    const json = Buffer.from(decodeURIComponent(v), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch { return; }
}
