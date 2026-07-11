import { describe, it, expect } from 'vitest';
import {
  validatePassword,
  passwordStrengthScore,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_RULE_IDS,
} from '../../shared/lib/validation/password';

// A password that satisfies every deterministic rule.
const STRONG = 'Longpass12';

describe('validatePassword', () => {
  it('accepts a password meeting every rule', () => {
    const { ok, failed } = validatePassword(STRONG);
    expect(ok).toBe(true);
    expect(failed).toEqual([]);
  });

  it('requires at least MIN_PASSWORD_LENGTH characters', () => {
    const short = 'Ab1' + 'x'.repeat(MIN_PASSWORD_LENGTH - 4); // one below the min
    expect(short.length).toBe(MIN_PASSWORD_LENGTH - 1);
    const { ok, failed } = validatePassword(short);
    expect(ok).toBe(false);
    expect(failed).toContain('minLength');
  });

  it('accepts exactly MIN_PASSWORD_LENGTH characters', () => {
    const exact = 'Abcdefgh12'.slice(0, MIN_PASSWORD_LENGTH);
    expect(exact.length).toBe(MIN_PASSWORD_LENGTH);
    expect(validatePassword(exact).failed).not.toContain('minLength');
  });

  it('rejects passwords longer than MAX_PASSWORD_LENGTH', () => {
    const long = 'Aa1' + 'x'.repeat(MAX_PASSWORD_LENGTH); // exceeds max
    const { ok, failed } = validatePassword(long);
    expect(ok).toBe(false);
    expect(failed).toContain('minLength');
  });

  it('requires a lowercase letter', () => {
    const { failed } = validatePassword('LONGPASS12');
    expect(failed).toContain('lower');
  });

  it('requires an uppercase letter', () => {
    const { failed } = validatePassword('longpass12');
    expect(failed).toContain('upper');
  });

  it('requires a number', () => {
    const { failed } = validatePassword('Longpassword');
    expect(failed).toContain('number');
  });

  it('does not require a symbol', () => {
    expect(validatePassword('Longpass12').failed).not.toContain('number');
    expect(validatePassword('Longpass12').ok).toBe(true);
  });

  it('rejects a password containing the email local-part', () => {
    const { ok, failed } = validatePassword('Jaime123456', { email: 'jaime@example.com' });
    expect(ok).toBe(false);
    expect(failed).toContain('noPersonal');
  });

  it('rejects a password containing the first or last name', () => {
    expect(validatePassword('Lovelace12', { lastName: 'Lovelace' }).failed).toContain('noPersonal');
    expect(validatePassword('AdaAda1234', { firstName: 'Ada' }).failed).toContain('noPersonal');
  });

  it('is case-insensitive when matching personal info', () => {
    const { failed } = validatePassword('SMITH12345', { lastName: 'smith' });
    expect(failed).toContain('noPersonal');
  });

  it('ignores personal-info fields shorter than 3 characters', () => {
    // A 2-char name would match almost anything, so it must not be used.
    expect(validatePassword('Longpass12', { firstName: 'Al' }).failed).not.toContain('noPersonal');
  });

  it('exposes rule ids in a stable, deduplicated order', () => {
    expect(PASSWORD_RULE_IDS).toEqual(['minLength', 'lower', 'upper', 'number', 'noPersonal']);
  });
});

describe('passwordStrengthScore', () => {
  it('scores an empty password 0', () => {
    expect(passwordStrengthScore('')).toBe(0);
  });

  it('scores a maxed-out password 4', () => {
    expect(passwordStrengthScore('Longer-Passphrase-99!')).toBe(4);
  });

  it('never decreases as the password gets stronger', () => {
    const weak = passwordStrengthScore('abc');
    const mid = passwordStrengthScore('Longpass12');
    const strong = passwordStrengthScore('Longer-Passphrase-99!');
    expect(weak).toBeLessThanOrEqual(mid);
    expect(mid).toBeLessThanOrEqual(strong);
  });

  it('stays within 0..4', () => {
    for (const pw of ['', 'a', 'Aa1!', 'Longpass12', 'Longer-Passphrase-99!']) {
      const s = passwordStrengthScore(pw);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(4);
    }
  });
});
