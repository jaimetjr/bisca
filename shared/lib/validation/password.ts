// Password policy shared verbatim by client and server so the two can never
// drift. This module MUST stay pure TypeScript — no Expo, React Native, or Node
// imports — so both runtimes can import it (see shared/lib/date.ts, which pulls
// in expo-localization and therefore can't be used server-side). The async
// breach check lives separately in server/lib/password-policy.ts.

export const MIN_PASSWORD_LENGTH = 10;
// bcrypt silently truncates input past 72 bytes, so anything longer is both
// pointless and misleading — reject it rather than hash a truncated secret.
export const MAX_PASSWORD_LENGTH = 72;

export type PasswordRuleId = 'minLength' | 'lower' | 'upper' | 'number' | 'noPersonal';

// Ordered for display in the checklist; also the order `failed` is returned in.
export const PASSWORD_RULE_IDS: readonly PasswordRuleId[] = [
  'minLength',
  'lower',
  'upper',
  'number',
  'noPersonal',
];

export interface PasswordContext {
  email?: string;
  firstName?: string;
  lastName?: string;
}

// Names/emails shorter than this are too generic to match on without flagging
// almost everything, so they're ignored.
const MIN_PERSONAL_TOKEN_LENGTH = 3;

function personalTokens(ctx?: PasswordContext): string[] {
  if (!ctx) return [];
  const tokens: string[] = [];
  if (ctx.email) tokens.push(ctx.email.split('@')[0]);
  if (ctx.firstName) tokens.push(ctx.firstName);
  if (ctx.lastName) tokens.push(ctx.lastName);
  return tokens
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= MIN_PERSONAL_TOKEN_LENGTH);
}

function containsPersonalInfo(password: string, ctx?: PasswordContext): boolean {
  const lower = password.toLowerCase();
  return personalTokens(ctx).some((token) => lower.includes(token));
}

/**
 * Check a password against the deterministic policy. Pure and synchronous —
 * the breach check (HaveIBeenPwned) is handled separately, server-side.
 * Returns the failed rule ids in `PASSWORD_RULE_IDS` order.
 */
export function validatePassword(
  password: string,
  ctx?: PasswordContext,
): { ok: boolean; failed: PasswordRuleId[] } {
  const failed: PasswordRuleId[] = [];
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    failed.push('minLength');
  }
  if (!/[a-z]/.test(password)) failed.push('lower');
  if (!/[A-Z]/.test(password)) failed.push('upper');
  if (!/[0-9]/.test(password)) failed.push('number');
  if (containsPersonalInfo(password, ctx)) failed.push('noPersonal');
  return { ok: failed.length === 0, failed };
}

/** Count how many of the four character classes appear in the password. */
function characterClassCount(password: string): number {
  let count = 0;
  if (/[a-z]/.test(password)) count++;
  if (/[A-Z]/.test(password)) count++;
  if (/[0-9]/.test(password)) count++;
  if (/[^A-Za-z0-9]/.test(password)) count++;
  return count;
}

/**
 * A cheap 0..4 heuristic for the strength meter. Not a security control — the
 * `validatePassword` rules and the breach check are the real gates. Rewards
 * length and character-class variety (symbols included, though not required).
 */
export function passwordStrengthScore(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length === 0) return 0;
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 14) score++;
  const classes = characterClassCount(password);
  if (classes >= 3) score++;
  if (classes >= 4) score++;
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
}
