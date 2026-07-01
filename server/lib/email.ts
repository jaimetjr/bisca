import { logger } from './logger';

const log = logger.child({ module: 'email' });

// Transactional email via Resend's REST API (no SDK dependency — uses global
// fetch). If RESEND_API_KEY is unset, we log the code to the server console
// instead of sending, so the flow is testable in dev without a key.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = process.env.EMAIL_FROM ?? 'Bisca <onboarding@resend.dev>';
const APP_NAME = 'Bisca';

async function sendEmail(to: string, subject: string, html: string, devCode?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev fallback: no key configured, so surface the code locally instead of
    // sending. NEVER reached in production where the key is set.
    log.warn({ to, subject, code: devCode }, 'RESEND_API_KEY not set — logging code instead of sending');
    return;
  }
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log.error({ status: res.status, body }, 'Resend send failed');
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
