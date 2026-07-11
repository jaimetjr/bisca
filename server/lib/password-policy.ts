import { createHash } from 'node:crypto';
import { logger } from './logger';

// HaveIBeenPwned "Pwned Passwords" range API, using k-anonymity: we hash the
// password with SHA-1, send only the first 5 hex chars, and match the 35-char
// suffix locally against the returned list. The full password/hash never leaves
// the server. https://haveibeenpwned.com/API/v3#PwnedPasswords
const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = 2500;

const log = logger.child({ module: 'password-policy' });

/**
 * True if the password appears in a known breach corpus. Fails **open**
 * (returns false) on any network/timeout/parse error: a HIBP outage must never
 * block a legitimate signup or password change. The composition rules in
 * shared/lib/validation/password.ts remain the hard gate regardless.
 */
export async function isPasswordPwned(password: string): Promise<boolean> {
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);
  try {
    const res = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      signal: controller.signal,
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) {
      log.warn({ status: res.status }, 'HIBP range lookup failed; allowing password');
      return false;
    }
    const body = await res.text();
    // Each line is "SUFFIX:COUNT". A count of 0 is padding (from Add-Padding).
    for (const line of body.split('\n')) {
      const [lineSuffix, countStr] = line.trim().split(':');
      if (lineSuffix.toUpperCase() === suffix && Number(countStr) > 0) {
        return true;
      }
    }
    return false;
  } catch (err) {
    log.warn({ err }, 'HIBP range lookup errored; allowing password');
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
