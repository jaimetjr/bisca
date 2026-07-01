import { randomInt } from 'node:crypto';
import { and, eq, desc, sql, isNull, lt } from 'drizzle-orm';
import { db } from '../db';
import { authCodes } from '../../shared/lib/schema';
import { hashPassword, verifyPassword } from './auth';

// One-time numeric codes for email verification / password reset. The plain
// code is returned once (to be emailed) and only its bcrypt hash is stored.

export type CodePurpose = 'email_verify' | 'password_reset';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Generate a fresh code for the user/purpose, invalidating any prior codes,
 * and return the plain code so the caller can email it.
 */
export async function issueCode(userId: string, purpose: CodePurpose): Promise<string> {
  // Drop any outstanding codes of this purpose so only the newest is valid.
  await db.delete(authCodes).where(
    and(eq(authCodes.userId, userId), eq(authCodes.purpose, purpose)),
  );

  const code = generateCode();
  const codeHash = await hashPassword(code);
  await db.insert(authCodes).values({
    userId,
    purpose,
    codeHash,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'too_many_attempts' };

/**
 * Validate a submitted code. On success the code is consumed (single-use).
 * On a wrong code the attempt counter increments; once it exceeds the limit
 * the code is rejected outright so a 6-digit code can't be brute-forced.
 */
export async function verifyCode(
  userId: string,
  purpose: CodePurpose,
  code: string,
): Promise<VerifyCodeResult> {
  const [row] = await db
    .select()
    .from(authCodes)
    .where(
      and(
        eq(authCodes.userId, userId),
        eq(authCodes.purpose, purpose),
        isNull(authCodes.consumedAt),
      ),
    )
    .orderBy(desc(authCodes.createdAt))
    .limit(1);

  if (!row) return { ok: false, reason: 'invalid' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  const match = await verifyPassword(code, row.codeHash);
  if (!match) {
    await db
      .update(authCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(authCodes.id, row.id));
    return { ok: false, reason: 'invalid' };
  }

  await db
    .update(authCodes)
    .set({ consumedAt: sql`now()` })
    .where(eq(authCodes.id, row.id));
  return { ok: true };
}

/**
 * Purge codes whose expiry has passed. `issueCode` already clears prior
 * same-purpose codes so growth is bounded, but consumed/abandoned codes for
 * users who never re-request would otherwise linger. Returns rows removed.
 */
export async function deleteExpiredCodes(): Promise<number> {
  const result = await db.delete(authCodes).where(lt(authCodes.expiresAt, new Date()));
  return result.rowCount ?? 0;
}
