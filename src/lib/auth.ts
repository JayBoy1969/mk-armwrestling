import type { AstroCookies } from 'astro';
import { getSecret } from './runtime';

export const SESSION_COOKIE = 'admin_session';

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Opaque session value derived from the admin password. An attacker can't forge
 * it without knowing the password, and it never exposes the password itself.
 */
export async function sessionToken(password: string): Promise<string> {
  return sha256Hex(`mkaw-admin-session:v1:${password}`);
}

export async function isAuthenticated(cookies: AstroCookies): Promise<boolean> {
  const password = getSecret('ADMIN_PASSWORD');
  const provided = cookies.get(SESSION_COOKIE)?.value;
  if (!password || !provided) return false;
  return provided === (await sessionToken(password));
}

/**
 * Like isAuthenticated, but also accepts a Bearer token in the Authorization
 * header (the raw ADMIN_PASSWORD) so non-browser clients (scripts, curl) can
 * call admin endpoints without a session cookie.
 */
export async function isAuthenticatedRequest(
  cookies: AstroCookies,
  request: Request
): Promise<boolean> {
  // Check existing cookie auth first
  if (await isAuthenticated(cookies)) return true;

  // Also accept an Authorization header: "Bearer <ADMIN_PASSWORD>"
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const provided = authHeader.slice(7);
    const password = getSecret('ADMIN_PASSWORD');
    return !!password && provided === password;
  }

  return false;
}
