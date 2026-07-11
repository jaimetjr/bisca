import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import { startTestServer, closeServer } from './helpers';
// Note: these resolve to the mocked modules below — vitest hoists vi.mock().
import { signAuthToken, verifyAuthToken } from '../../server/lib/auth';
import { verifyCode } from '../../server/lib/auth-codes';
import { isPasswordPwned } from '../../server/lib/password-policy';

// requireAuth/signAuthToken need a secret; set one before the auth module reads it.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret-at-least-16-chars';

// Mock the DB so the server starts without a real database. Terminal nodes
// resolve to [] (selects) or undefined (mutations); register's insert returns
// a fabricated id.
const emptyArray = Promise.resolve([]);
function makeChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    groupBy: () => chain,
    orderBy: () => chain,
    limit: () => emptyArray,
    then: (onFulfilled: (v: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) =>
      emptyArray.then(onFulfilled, onRejected),
  };
  return chain;
}
function makeMutationChain(): Record<string, unknown> {
  const c: Record<string, unknown> = {
    set: () => c,
    where: () => c,
    then: (cb: (v: undefined) => unknown) => Promise.resolve(undefined).then(cb),
  };
  return c;
}

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(() => makeChain()),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'test-user-id' }]),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        then: (cb: (v: undefined) => unknown) => Promise.resolve(undefined).then(cb),
      })),
    })),
    update: vi.fn(() => makeMutationChain()),
    delete: vi.fn(() => makeMutationChain()),
  },
}));

// Email is a no-op; code issue/verify are controlled per-test.
vi.mock('../../server/lib/email', () => ({
  sendVerificationCode: vi.fn(),
  sendPasswordResetCode: vi.fn(),
}));
vi.mock('../../server/lib/auth-codes', () => ({
  issueCode: vi.fn(async () => '123456'),
  verifyCode: vi.fn(async () => ({ ok: true })),
}));
// Never hit the real HIBP network in tests; default to "not breached".
vi.mock('../../server/lib/password-policy', () => ({
  isPasswordPwned: vi.fn(async () => false),
}));

let server: Server;

beforeAll(async () => {
  ({ server } = await startTestServer());
});
afterAll(async () => {
  await closeServer(server);
});

describe('token helpers (auth.ts)', () => {
  it('round-trips the ev=true claim', async () => {
    const token = await signAuthToken('user-1', true);
    expect(await verifyAuthToken(token)).toEqual({ userId: 'user-1', emailVerified: true });
  });

  it('round-trips the ev=false claim', async () => {
    const token = await signAuthToken('user-2', false);
    expect(await verifyAuthToken(token)).toEqual({ userId: 'user-2', emailVerified: false });
  });

  it('rejects a tampered token', async () => {
    const token = await signAuthToken('user-3', true);
    expect(await verifyAuthToken(token.slice(0, -3) + 'zzz')).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await verifyAuthToken('not.a.jwt')).toBeNull();
  });
});

describe('POST /api/auth/register', () => {
  const valid = {
    email: 'new@example.com',
    password: 'Longenough1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    dateOfBirth: '1990-01-01',
  };

  it('rejects an invalid email', async () => {
    const res = await request(server).post('/api/auth/register').send({ ...valid, email: 'nope' });
    expect(res.status).toBe(400);
  });

  it('rejects a too-short password', async () => {
    const res = await request(server).post('/api/auth/register').send({ ...valid, password: 'Short1' });
    expect(res.status).toBe(400);
  });

  it('rejects a password missing an uppercase letter', async () => {
    const res = await request(server).post('/api/auth/register').send({ ...valid, password: 'longenough1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('weak_password');
  });

  it('rejects a breached password', async () => {
    vi.mocked(isPasswordPwned).mockResolvedValueOnce(true);
    const res = await request(server)
      .post('/api/auth/register')
      .send({ ...valid, email: 'fresh@example.com', password: 'Notbreached9' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('password_pwned');
  });

  it('rejects a missing name', async () => {
    const res = await request(server).post('/api/auth/register').send({ ...valid, lastName: '' });
    expect(res.status).toBe(400);
  });

  it('rejects an under-18 date of birth', async () => {
    const res = await request(server).post('/api/auth/register').send({ ...valid, dateOfBirth: '2020-01-01' });
    expect(res.status).toBe(400);
  });

  it('creates an account and returns an unverified token', async () => {
    const res = await request(server).post('/api/auth/register').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.emailVerified).toBe(false);
    const claims = await verifyAuthToken(res.body.token);
    expect(claims?.emailVerified).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  it('rejects missing fields', async () => {
    const res = await request(server).post('/api/auth/login').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('returns 401 for an unknown account', async () => {
    const res = await request(server).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'whatever1' });
    expect(res.status).toBe(401);
  });
});

// Email verification is optional for v1 (the requireVerified gate was removed
// until a verified sending domain is configured). Data endpoints require only
// a valid token, verified or not.
describe('data endpoints require auth only (email verification optional in v1)', () => {
  it('GET /api/stats → 401 without a token', async () => {
    const res = await request(server).get('/api/stats');
    expect(res.status).toBe(401);
  });

  it('GET /api/stats → 200 with an unverified token', async () => {
    const token = await signAuthToken('user-x', false);
    const res = await request(server).get('/api/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('wins');
  });

  it('GET /api/stats → 200 with a verified token', async () => {
    const token = await signAuthToken('user-x', true);
    const res = await request(server).get('/api/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('wins');
  });

  it('POST /api/game-history → 200 with an unverified token', async () => {
    const token = await signAuthToken('user-x', false);
    const res = await request(server)
      .post('/api/game-history')
      .set('Authorization', `Bearer ${token}`)
      .send({ result: 'win', score: 61, opponentScore: 30, mode: 'ai' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });
});

describe('POST /api/auth/verify-email', () => {
  it('returns 401 without a token', async () => {
    const res = await request(server).post('/api/auth/verify-email').send({ code: '123456' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a malformed code', async () => {
    const token = await signAuthToken('user-v', false);
    const res = await request(server)
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'abc' });
    expect(res.status).toBe(400);
  });

  it('verifies and reissues a verified token on a valid code', async () => {
    const token = await signAuthToken('user-v', false);
    const res = await request(server)
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.emailVerified).toBe(true);
    const claims = await verifyAuthToken(res.body.token);
    expect(claims?.emailVerified).toBe(true);
  });

  it('returns 400 for an incorrect code', async () => {
    vi.mocked(verifyCode).mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    const token = await signAuthToken('user-v', false);
    const res = await request(server)
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '654321' });
    expect(res.status).toBe(400);
  });

  it('returns 429 when attempts are exhausted', async () => {
    vi.mocked(verifyCode).mockResolvedValueOnce({ ok: false, reason: 'too_many_attempts' });
    const token = await signAuthToken('user-v', false);
    const res = await request(server)
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '654321' });
    expect(res.status).toBe(429);
  });
});

describe('POST /api/auth/request-password-reset', () => {
  it('returns 400 for an invalid email', async () => {
    const res = await request(server).post('/api/auth/request-password-reset').send({ email: 'bad' });
    expect(res.status).toBe(400);
  });

  it('returns a generic 200 for an unknown email (no enumeration)', async () => {
    const res = await request(server).post('/api/auth/request-password-reset').send({ email: 'unknown@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('returns 400 for a malformed code', async () => {
    const res = await request(server)
      .post('/api/auth/reset-password')
      .send({ email: 'a@b.com', code: '12', newPassword: 'longenough1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a too-short password', async () => {
    const res = await request(server)
      .post('/api/auth/reset-password')
      .send({ email: 'a@b.com', code: '123456', newPassword: 'Short1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('weak_password');
  });

  it('returns 400 for a breached password', async () => {
    vi.mocked(isPasswordPwned).mockResolvedValueOnce(true);
    const res = await request(server)
      .post('/api/auth/reset-password')
      .send({ email: 'a@b.com', code: '123456', newPassword: 'Notbreached9' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('password_pwned');
  });
});

describe('DELETE /api/users/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request(server).delete('/api/users/me').send({ password: 'whatever1' });
    expect(res.status).toBe(401);
  });

  it('is reachable with an UNVERIFIED token (deletion is not behind requireVerified)', async () => {
    // Under the mock, select resolves to [] so no account is ever found and the
    // handler returns 404. The point of the assertion is that an unverified
    // token still reaches that lookup — if the route were gated by
    // requireVerified it would return 403 instead. GDPR: an unverified user
    // must be able to delete their account.
    const token = await signAuthToken('user-del', false);
    const res = await request(server)
      .delete('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'whatever1' });
    expect(res.status).toBe(404);
  });
});

describe('rate limiting', () => {
  // Distinct X-Forwarded-For values isolate these buckets from the other tests.
  it('throttles repeated logins for one account (429)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) {
      const res = await request(server)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.7')
        .send({ email: 'brute@example.com', password: 'whatever1' });
      statuses.push(res.status);
    }
    // Per-account limiter capacity is 8: first 8 reach the auth path (401),
    // the 9th is rejected outright.
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses[8]).toBe(429);
  });

  it('throttles repeated registrations from one IP (429)', async () => {
    const body = { email: 'flood@example.com', password: 'Longenough1', firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01' };
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(server)
        .post('/api/auth/register')
        .set('X-Forwarded-For', '203.0.113.9')
        .send(body);
      last = res.status;
    }
    // Per-IP register capacity is 10; the 11th attempt is rate-limited.
    expect(last).toBe(429);
  });
});
