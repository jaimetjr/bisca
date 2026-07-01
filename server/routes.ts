import './types';
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import { handleWebSocket, getPublicRooms } from './game-rooms';
import { db } from './db';
import { gameHistory, users, userAchievements, userQuestProgress, authCodes } from '../shared/lib/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { hashPassword, verifyPassword, signAuthToken, verifyAuthToken } from './lib/auth';
import { issueCode, verifyCode } from './lib/auth-codes';
import { sendVerificationCode, sendPasswordResetCode } from './lib/email';
import { createKeyedRateLimiter } from './lib/rate-limit';
import {
  recordGameAndEvaluate,
  listUnlockedAchievementIds,
} from './lib/achievement-service';
import { ACHIEVEMENTS, getAchievementXp } from '../shared/lib/achievements/definitions';
import {
  applyGameToTodaysQuests,
  claimQuest,
  getTodaysQuests,
} from './lib/quest-service';
import { logger } from './lib/logger';

const log = logger.child({ module: 'routes' });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_PASSWORD_LENGTH = 8;

// Throttle code emails so the endpoints can't be used to spam an inbox or
// brute-force: at most 5 code requests per 15 min per key (userId or email).
const codeRequestLimiter = createKeyedRateLimiter({ capacity: 5, refillPerMs: 5 / (15 * 60_000) });

// Brute-force / abuse protection on the credential endpoints (token buckets,
// refilled continuously over 15 min).
const loginIpLimiter = createKeyedRateLimiter({ capacity: 20, refillPerMs: 20 / (15 * 60_000) });    // per IP
const loginEmailLimiter = createKeyedRateLimiter({ capacity: 8, refillPerMs: 8 / (15 * 60_000) });   // per account
const registerIpLimiter = createKeyedRateLimiter({ capacity: 10, refillPerMs: 10 / (15 * 60_000) }); // per IP

const TOO_MANY = { error: 'Too many attempts — please try again later' };

/** Best-effort client IP, honoring x-forwarded-for when behind a proxy. */
function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

/** Age check from an ISO (YYYY-MM-DD) date — server-side, locale-independent. */
function isAtLeast18ISO(iso: string): boolean {
  if (!ISO_DATE_RE.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dob = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dob.getTime()) || dob.getUTCDate() !== d || dob.getUTCMonth() !== m - 1) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  const mDiff = now.getUTCMonth() - (m - 1);
  if (mDiff < 0 || (mDiff === 0 && now.getUTCDate() < d)) age--;
  return age >= 18;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const claims = await verifyAuthToken(authHeader.slice(7));
  if (!claims) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  req.userId = claims.userId;
  req.emailVerified = claims.emailVerified;
  next();
}

// Defense-in-depth for the hard email-verification gate: data endpoints reject
// unverified users even if the client guard is bypassed. Must run after
// requireAuth. (The token's `ev` claim can lag a fresh verification by one
// token issuance, which only causes a self-healing false negative.)
function requireVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.emailVerified) {
    res.status(403).json({ error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' });
    return;
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    app.post("/api/auth/register", async (req: Request, res: Response) => {
      try {
        if (!registerIpLimiter.take(clientIp(req))) {
          res.status(429).json(TOO_MANY);
          return;
        }
        const { email, password, firstName, lastName, dateOfBirth } = req.body ?? {};
        if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
          res.status(400).json({ error: 'A valid email is required' });
          return;
        }
        if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
          res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
          return;
        }
        if (typeof firstName !== 'string' || !firstName.trim() ||
            typeof lastName !== 'string' || !lastName.trim()) {
          res.status(400).json({ error: 'First and last name are required' });
          return;
        }
        if (typeof dateOfBirth !== 'string' || !isAtLeast18ISO(dateOfBirth)) {
          res.status(400).json({ error: 'You must be at least 18 years old' });
          return;
        }

        const normalizedEmail = email.trim().toLowerCase();
        const [existing] = await db.select({ id: users.id }).from(users)
          .where(eq(users.email, normalizedEmail)).limit(1);
        if (existing) {
          res.status(409).json({ error: 'An account with this email already exists' });
          return;
        }

        const passwordHash = await hashPassword(password);
        const [created] = await db.insert(users)
          .values({
            email: normalizedEmail,
            passwordHash,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            dateOfBirth,
          })
          .returning({ id: users.id });

        // Email-verification gate: account starts unverified; send a code.
        try {
          const code = await issueCode(created.id, 'email_verify');
          await sendVerificationCode(normalizedEmail, code);
        } catch (err) {
          // Don't fail registration if the email send hiccups — the user can
          // resend from the verify screen.
          log.error({ err }, 'failed to send verification email on register');
        }

        const token = await signAuthToken(created.id, false);
        res.status(201).json({ token, userId: created.id, emailVerified: false });
      } catch (err) {
        log.error({ err }, 'registration failed');
        res.status(500).json({ error: 'Failed to create account' });
      }
    });

    app.post("/api/auth/login", async (req: Request, res: Response) => {
      try {
        if (!loginIpLimiter.take(clientIp(req))) {
          res.status(429).json(TOO_MANY);
          return;
        }
        const { email, password } = req.body ?? {};
        if (typeof email !== 'string' || typeof password !== 'string') {
          res.status(400).json({ error: 'Email and password are required' });
          return;
        }
        const normalizedEmail = email.trim().toLowerCase();
        // Per-account throttle blunts distributed attacks against one email.
        if (!loginEmailLimiter.take(normalizedEmail)) {
          res.status(429).json(TOO_MANY);
          return;
        }
        const [user] = await db.select().from(users)
          .where(eq(users.email, normalizedEmail)).limit(1);
        // Always run a compare to keep timing consistent whether or not the
        // account exists, then return a single generic error.
        const ok = user
          ? await verifyPassword(password, user.passwordHash)
          : await verifyPassword(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv');
        if (!user || !ok) {
          res.status(401).json({ error: 'Invalid email or password' });
          return;
        }
        const token = await signAuthToken(user.id, user.emailVerified);
        res.json({ token, userId: user.id, emailVerified: user.emailVerified });
      } catch (err) {
        log.error({ err }, 'login failed');
        res.status(500).json({ error: 'Failed to sign in' });
      }
    });

    app.post("/api/auth/verify-email", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const { code } = req.body ?? {};
        if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
          res.status(400).json({ error: 'Enter the 6-digit code' });
          return;
        }
        const result = await verifyCode(userId, 'email_verify', code);
        if (!result.ok) {
          const status = result.reason === 'too_many_attempts' ? 429 : 400;
          res.status(status).json({ error: result.reason });
          return;
        }
        await db.update(users)
          .set({ emailVerified: true, updatedAt: sql`now()` })
          .where(eq(users.id, userId));
        // Reissue a token reflecting the now-verified state.
        const token = await signAuthToken(userId, true);
        res.json({ ok: true, token, emailVerified: true });
      } catch (err) {
        log.error({ err }, 'email verification failed');
        res.status(500).json({ error: 'Failed to verify email' });
      }
    });

    app.post("/api/auth/resend-verification", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        if (req.emailVerified) {
          res.json({ ok: true }); // already verified — nothing to do
          return;
        }
        if (!codeRequestLimiter.take(`verify:${userId}`)) {
          res.status(429).json({ error: 'Too many requests — try again later' });
          return;
        }
        const [user] = await db.select({ email: users.email }).from(users)
          .where(eq(users.id, userId)).limit(1);
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }
        const code = await issueCode(userId, 'email_verify');
        await sendVerificationCode(user.email, code);
        res.json({ ok: true });
      } catch (err) {
        log.error({ err }, 'resend verification failed');
        res.status(500).json({ error: 'Failed to resend code' });
      }
    });

    app.post("/api/auth/request-password-reset", async (req: Request, res: Response) => {
      // Generic 200 regardless of outcome so the endpoint can't be used to
      // enumerate which emails have accounts.
      const genericOk = () => res.json({ ok: true });
      try {
        const { email } = req.body ?? {};
        if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
          res.status(400).json({ error: 'A valid email is required' });
          return;
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (!codeRequestLimiter.take(`reset:${normalizedEmail}`)) {
          genericOk();
          return;
        }
        const [user] = await db.select({ id: users.id }).from(users)
          .where(eq(users.email, normalizedEmail)).limit(1);
        if (user) {
          const code = await issueCode(user.id, 'password_reset');
          await sendPasswordResetCode(normalizedEmail, code);
        }
        genericOk();
      } catch (err) {
        log.error({ err }, 'request password reset failed');
        // Still return generic success to avoid leaking state.
        res.json({ ok: true });
      }
    });

    app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
      try {
        const { email, code, newPassword } = req.body ?? {};
        if (typeof email !== 'string' || !EMAIL_RE.test(email) ||
            typeof code !== 'string' || !/^\d{6}$/.test(code)) {
          res.status(400).json({ error: 'Invalid email or code' });
          return;
        }
        if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
          res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
          return;
        }
        const normalizedEmail = email.trim().toLowerCase();
        const [user] = await db.select({ id: users.id }).from(users)
          .where(eq(users.email, normalizedEmail)).limit(1);
        // Same generic error whether the email is unknown or the code is wrong.
        if (!user) {
          res.status(400).json({ error: 'invalid' });
          return;
        }
        const result = await verifyCode(user.id, 'password_reset', code);
        if (!result.ok) {
          const status = result.reason === 'too_many_attempts' ? 429 : 400;
          res.status(status).json({ error: result.reason });
          return;
        }
        // A successful reset also verifies the email (they proved control of it)
        // and lets them sign in fresh afterward.
        await db.update(users)
          .set({ passwordHash: await hashPassword(newPassword), emailVerified: true, updatedAt: sql`now()` })
          .where(eq(users.id, user.id));
        res.json({ ok: true });
      } catch (err) {
        log.error({ err }, 'reset password failed');
        res.status(500).json({ error: 'Failed to reset password' });
      }
    });

    app.post("/api/auth/change-password", requireAuth, requireVerified, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const { currentPassword, newPassword } = req.body ?? {};
        if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
          res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
          return;
        }
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }
        if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, user.passwordHash))) {
          res.status(401).json({ error: 'Current password is incorrect' });
          return;
        }
        await db.update(users)
          .set({ passwordHash: await hashPassword(newPassword), updatedAt: sql`now()` })
          .where(eq(users.id, userId));
        res.json({ ok: true });
      } catch (err) {
        log.error({ err }, 'change password failed');
        res.status(500).json({ error: 'Failed to change password' });
      }
    });

    // Permanent account deletion (GDPR / app-store requirement). Requires a
    // password re-confirmation since it's irreversible. Intentionally does NOT
    // require a verified email — an unverified user must still be able to delete
    // their data. Child rows are removed explicitly in a transaction so the
    // delete is correct even before the FK cascade migration is applied; the
    // ON DELETE CASCADE in schema.ts is a backstop.
    app.delete("/api/users/me", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const { password } = req.body ?? {};
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }
        if (typeof password !== 'string' || !(await verifyPassword(password, user.passwordHash))) {
          res.status(401).json({ error: 'Current password is incorrect' });
          return;
        }
        await db.transaction(async (tx) => {
          await tx.delete(gameHistory).where(eq(gameHistory.userId, userId));
          await tx.delete(userAchievements).where(eq(userAchievements.userId, userId));
          await tx.delete(userQuestProgress).where(eq(userQuestProgress.userId, userId));
          await tx.delete(authCodes).where(eq(authCodes.userId, userId));
          await tx.delete(users).where(eq(users.id, userId));
        });
        res.json({ ok: true });
      } catch (err) {
        log.error({ err }, 'account deletion failed');
        res.status(500).json({ error: 'Failed to delete account' });
      }
    });

    app.get("/api/rooms", async (_req, res) => {
        try {
            res.json(await getPublicRooms());
        } catch (err) {
            log.error({ err }, 'failed to list rooms');
            res.status(500).json({ error: 'Failed to list rooms' });
        }
    });

    app.get("/api/stats", requireAuth, requireVerified, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const [agg, recent] = await Promise.all([
          db.select({
            wins: sql<number>`COUNT(*) FILTER (WHERE result = 'win')`,
            losses: sql<number>`COUNT(*) FILTER (WHERE result = 'loss')`,
            avgScore: sql<number>`COALESCE(ROUND(AVG(score)), 0)`,
          }).from(gameHistory).where(eq(gameHistory.userId, userId)),
          db.select().from(gameHistory)
            .where(eq(gameHistory.userId, userId))
            .orderBy(desc(gameHistory.playedAt))
            .limit(10),
        ]);
        const { wins, losses, avgScore } = agg[0] ?? { wins: 0, losses: 0, avgScore: 0 };
        res.json({ wins, losses, avgScore, recent });
      } catch {
        res.status(500).json({ error: 'Failed to fetch stats' });
      }
    });

    app.get("/api/users/me", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const [profile] = await db.select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          dateOfBirth: users.dateOfBirth,
        }).from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!profile) {
          res.status(404).json({ error: 'Profile not found' });
          return;
        }
        res.json(profile);
      } catch {
        res.status(500).json({ error: 'Failed to fetch profile' });
      }
    });

    app.post("/api/users/profile", requireAuth, requireVerified, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const { firstName, lastName, dateOfBirth } = req.body ?? {};
        if (typeof firstName !== 'string' || !firstName.trim() ||
            typeof lastName !== 'string' || !lastName.trim()) {
          res.status(400).json({ error: 'First and last name are required' });
          return;
        }
        if (typeof dateOfBirth !== 'string' || !isAtLeast18ISO(dateOfBirth)) {
          res.status(400).json({ error: 'You must be at least 18 years old' });
          return;
        }
        await db.update(users)
          .set({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            dateOfBirth,
            updatedAt: sql`now()`,
          })
          .where(eq(users.id, userId));
        res.json({ ok: true });
      } catch (err) {
        log.error({ err }, 'failed to save profile');
        res.status(500).json({ error: 'Failed to save profile' });
      }
    });

    app.post("/api/game-history", requireAuth, requireVerified, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const { result, score, opponentScore, mode } = req.body;
        if (
          (result !== 'win' && result !== 'loss' && result !== 'draw') ||
          (mode !== 'ai' && mode !== 'online') ||
          typeof score !== 'number' ||
          typeof opponentScore !== 'number'
        ) {
          res.status(400).json({ error: 'Invalid game payload' });
          return;
        }
        const newlyUnlocked = await recordGameAndEvaluate({
          userId,
          result,
          score,
          opponentScore,
          mode,
        });
        // Quest progress runs alongside achievements; failures don't fail the
        // game-history write, but we log them so they don't go silent.
        try {
          await applyGameToTodaysQuests(userId, { result, score, opponentScore, mode });
        } catch (err) {
          log.error({ err }, 'quest progress update failed');
        }
        res.json({ ok: true, newlyUnlocked });
      } catch (err) {
        log.error({ err }, 'failed to save game');
        res.status(500).json({ error: 'Failed to save game' });
      }
    });

    app.get("/api/quests/today", requireAuth, requireVerified, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const { date, quests } = await getTodaysQuests(userId);
        res.json({
          date,
          quests: quests.map(({ def, progress }) => ({
            id: def.id,
            title: def.title,
            description: def.description,
            icon: def.icon,
            xp: def.xp,
            target: def.target,
            progress: progress.progress,
            claimed: progress.claimed,
            claimable: progress.progress >= progress.target && !progress.claimed,
          })),
        });
      } catch (err) {
        log.error({ err }, 'failed to fetch quests');
        res.status(500).json({ error: 'Failed to fetch quests' });
      }
    });

    app.post("/api/quests/claim", requireAuth, requireVerified, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const { questId } = req.body ?? {};
        if (typeof questId !== 'string' || questId.length === 0) {
          res.status(400).json({ error: 'questId required' });
          return;
        }
        const result = await claimQuest(userId, questId);
        if (!result.ok) {
          const code = result.reason === 'already_claimed' ? 409
            : result.reason === 'incomplete' ? 400
            : 404;
          res.status(code).json({ error: result.reason });
          return;
        }
        res.json({ ok: true, xp: result.xp });
      } catch (err) {
        log.error({ err }, 'failed to claim quest');
        res.status(500).json({ error: 'Failed to claim quest' });
      }
    });

    app.get("/api/achievements", requireAuth, requireVerified, async (req: Request, res: Response) => {
      try {
        const userId = req.userId!;
        const unlockedIds = await listUnlockedAchievementIds(userId);
        const unlockedSet = new Set(unlockedIds);
        const list = ACHIEVEMENTS.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          icon: a.icon,
          xp: a.xp,
          unlocked: unlockedSet.has(a.id),
        }));
        res.json({
          achievements: list,
          totalXp: getAchievementXp(unlockedIds),
          unlockedCount: unlockedIds.length,
          totalCount: ACHIEVEMENTS.length,
        });
      } catch (err) {
        log.error({ err }, 'failed to fetch achievements');
        res.status(500).json({ error: 'Failed to fetch achievements' });
      }
    });

    app.get("/api/leaderboard", async (req: Request, res: Response) => {
      try {
        const periodDays = req.query.period === 'all' ? null : 7;
        const rows = await db
          .select({
            userId: gameHistory.userId,
            firstName: users.firstName,
            wins: sql<number>`COUNT(*) FILTER (WHERE ${gameHistory.result} = 'win')`.as('wins'),
            games: sql<number>`COUNT(*)`.as('games'),
            avgScore: sql<number>`COALESCE(ROUND(AVG(${gameHistory.score}))::int, 0)`.as('avgScore'),
          })
          .from(gameHistory)
          .leftJoin(users, eq(users.id, gameHistory.userId))
          .where(
            periodDays
              ? sql`${gameHistory.playedAt} > now() - interval '${sql.raw(String(periodDays))} days'`
              : sql`true`,
          )
          .groupBy(gameHistory.userId, users.firstName)
          .orderBy(sql`wins DESC, "avgScore" DESC`)
          .limit(20);
        res.json({
          period: periodDays ? `${periodDays}d` : 'all',
          entries: rows.map((r, i) => ({
            rank: i + 1,
            displayName: r.firstName ?? 'Player',
            wins: r.wins,
            games: r.games,
            avgScore: r.avgScore,
          })),
        });
      } catch (err) {
        log.error({ err }, 'failed to fetch leaderboard');
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
    });

    const httpServer = createServer(app);

    const allowedOrigins = new Set(
      (process.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    );

    function isOriginAllowed(origin: string | undefined): boolean {
      if (!origin) {
        // Native mobile clients (Expo) connect without an Origin header — allow.
        return true;
      }
      if (allowedOrigins.has(origin)) return true;
      if (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('https://localhost:')
      ) {
        return true;
      }
      return false;
    }

    const wss = new WebSocketServer({
      server: httpServer,
      path: '/',
      verifyClient: ({ origin }, cb) => {
        if (isOriginAllowed(origin)) {
          cb(true);
        } else {
          cb(false, 403, 'Forbidden origin');
        }
      },
    });

    wss.on('connection', (ws, request: IncomingMessage) => {
      handleWebSocket(ws, request);
    });

    return httpServer;
}
