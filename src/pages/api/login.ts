import type { APIRoute } from 'astro';
import { getSecret } from '../../lib/runtime';
import { SESSION_COOKIE, sessionToken } from '../../lib/auth';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const expected = getSecret('ADMIN_PASSWORD');
  if (!expected) {
    return json({ error: 'Admin password is not configured on the server' }, 500);
  }

  let password: unknown;
  try {
    ({ password } = (await request.json()) as { password?: unknown });
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof password !== 'string' || password !== expected) {
    return json({ error: 'Incorrect password' }, 401);
  }

  cookies.set(SESSION_COOKIE, await sessionToken(expected), {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return json({ success: true }, 200);
};
