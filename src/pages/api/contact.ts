import type { APIRoute } from 'astro';
import { getSecret } from '../../lib/runtime';

export const prerender = false;

// Destination lives only in server code so it's never exposed in page HTML.
const TO_EMAIL = 'info@mkarmwrestling.co.uk';
const DEFAULT_FROM = 'MK Armwrestling Website <noreply@mkarmwrestling.co.uk>';

const SUBJECT_LABELS: Record<string, string> = {
  general: 'General Inquiry',
  training: 'Training & Membership',
  competition: 'Competition Information',
  sponsorship: 'Sponsorship',
  other: 'Other',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const POST: APIRoute = async ({ request }) => {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const { name, email, subject, message, website } = (data ?? {}) as Record<string, unknown>;

  // Honeypot: the hidden "website" field is invisible to people. If it's filled,
  // it's a bot — accept silently so the bot thinks it succeeded.
  if (typeof website === 'string' && website.trim() !== '') {
    return json({ success: true }, 200);
  }

  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const cleanMessage = typeof message === 'string' ? message.trim() : '';

  if (!cleanName) return json({ error: 'Name is required' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return json({ error: 'A valid email is required' }, 400);
  }
  if (!cleanMessage) return json({ error: 'Message is required' }, 400);

  const apiKey = getSecret('RESEND_API_KEY');
  if (!apiKey || apiKey === 'your_resend_api_key_here') {
    return json({ error: 'Email service is not configured' }, 500);
  }
  const from = getSecret('RESEND_FROM') || DEFAULT_FROM;

  const subjectKey = typeof subject === 'string' ? subject : 'general';
  const subjectLabel = SUBJECT_LABELS[subjectKey] ?? 'General Inquiry';

  const safeName = escapeHtml(cleanName);
  const safeEmail = escapeHtml(cleanEmail);
  const safeMessage = escapeHtml(cleanMessage).replace(/\n/g, '<br>');

  const html =
    `<h2>New message from the MK Armwrestling website</h2>` +
    `<p><strong>Name:</strong> ${safeName}</p>` +
    `<p><strong>Email:</strong> ${safeEmail}</p>` +
    `<p><strong>Subject:</strong> ${escapeHtml(subjectLabel)}</p>` +
    `<p><strong>Message:</strong></p><p>${safeMessage}</p>`;

  const text =
    `New message from the MK Armwrestling website\n\n` +
    `Name: ${cleanName}\nEmail: ${cleanEmail}\nSubject: ${subjectLabel}\n\n${cleanMessage}\n`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [TO_EMAIL],
        reply_to: cleanEmail,
        subject: `Contact form: ${subjectLabel} — ${cleanName}`,
        html,
        text,
      }),
    });

    if (!res.ok) {
      console.error('Resend error:', res.status, await res.text());
      return json({ error: 'Failed to send message' }, 502);
    }

    return json({ success: true }, 200);
  } catch (e) {
    console.error('Contact form error:', e);
    return json({ error: 'Failed to send message' }, 500);
  }
};
