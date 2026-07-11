import { logger } from './logger';

const log = logger.child({ module: 'email' });

// Transactional email via Brevo's REST API (no SDK dependency — uses global
// fetch). Brevo's free tier needs no domain: verify a single sender address in
// the dashboard and it can email arbitrary recipients. If BREVO_API_KEY is
// unset, we log the code to the server console instead of sending, so the flow
// is testable in dev without a key.

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const FROM = process.env.EMAIL_FROM ?? 'Bisca <no-reply@example.com>';
const APP_NAME = 'Bisca';

// Parse an "Name <email>" string into Brevo's structured sender object,
// falling back to treating the whole value as a bare address.
function parseSender(value: string): { name: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match
    ? { name: match[1] || APP_NAME, email: match[2] }
    : { name: APP_NAME, email: value.trim() };
}

async function sendEmail(to: string, subject: string, html: string, devCode?: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    // Dev fallback: no key configured, so surface the code locally instead of
    // sending. NEVER reached in production where the key is set.
    log.warn({ to, subject, code: devCode }, 'BREVO_API_KEY not set — logging code instead of sending');
    return;
  }
  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseSender(FROM),
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.error({ status: res.status, body }, 'Brevo send failed');
    throw new Error('Failed to send email');
  }
}

function codeEmailHtml(intro: string, code: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a472a; margin-bottom: 8px;">${APP_NAME}</h2>
      <p style="color: #333; font-size: 15px;">${intro}</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a472a; text-align: center; margin: 24px 0;">${code}</p>
      <p style="color: #888; font-size: 13px;">This code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>
    </div>`;
}

export async function sendVerificationCode(to: string, code: string): Promise<void> {
  await sendEmail(
    to,
    `${APP_NAME} — verify your email`,
    codeEmailHtml('Enter this code in the app to verify your email address:', code),
    code,
  );
}

export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  await sendEmail(
    to,
    `${APP_NAME} — reset your password`,
    codeEmailHtml('Enter this code in the app to reset your password:', code),
    code,
  );
}
