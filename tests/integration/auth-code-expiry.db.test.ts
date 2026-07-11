import { describe, it, expect, afterAll } from 'vitest';

// These tests talk to a REAL Postgres (no db mock) because the bug they guard
// against lives in the database, not the code: every timestamp column is
// declared `timestamptz` in the schema, but a drifted DB had them as
// `timestamp without time zone`, which shifted reads by the server's TZ offset
// and made reset codes "expire" ~3h late (an expired code was still accepted).
// Mocked-DB unit tests cannot catch column-type drift.
//
// Skipped unless DATABASE_URL is set, e.g.:
//   DATABASE_URL="postgres://..." npm test
const runDb = process.env.DATABASE_URL ? describe : describe.skip;

runDb('auth-code expiry (real DB)', () => {
  afterAll(async () => {
    const { db } = await import('../../server/db');
    await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
  });

  it('stores auth_codes.expires_at as timestamptz (not naked timestamp)', async () => {
    const { db } = await import('../../server/db');
    const { sql } = await import('drizzle-orm');
    const res = await db.execute(
      sql`select data_type from information_schema.columns
          where table_name = 'auth_codes' and column_name = 'expires_at'`,
    );
    expect((res.rows[0] as { data_type: string }).data_type).toBe('timestamp with time zone');
  });

  it('rejects a reset code whose expiry has passed', async () => {
    const { db } = await import('../../server/db');
    const { issueCode, verifyCode } = await import('../../server/lib/auth-codes');
    const { users, authCodes } = await import('../../shared/lib/schema');
    const { eq } = await import('drizzle-orm');

    const email = `expiry-test-${Date.now()}@test.local`;
    const [u] = await db
      .insert(users)
      .values({ email, passwordHash: 'x', firstName: 'T', lastName: 'T', dateOfBirth: '1990-01-01' })
      .returning({ id: users.id });
    try {
      // A fresh code verifies.
      const fresh = await issueCode(u.id, 'password_reset');
      expect(await verifyCode(u.id, 'password_reset', fresh)).toEqual({ ok: true });

      // Backdate a fresh code's expiry into the past — it must be rejected.
      const stale = await issueCode(u.id, 'password_reset');
      await db
        .update(authCodes)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(authCodes.userId, u.id));
      expect(await verifyCode(u.id, 'password_reset', stale)).toEqual({ ok: false, reason: 'expired' });
    } finally {
      await db.delete(authCodes).where(eq(authCodes.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
  });
});
