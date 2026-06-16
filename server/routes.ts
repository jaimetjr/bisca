import './types';
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import { handleWebSocket, getPublicRooms } from './game-rooms';
import { db } from './db';
import { gameHistory, userProfiles } from '../shared/lib/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { verifyToken } from '@clerk/backend';
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

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? '';

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    req.clerkUserId = payload.sub;
    next();
  } catch (err) {
    log.warn({ err }, 'token verification failed');
    res.status(401).json({ error: 'Invalid token' });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    app.get("/api/rooms", async (_req, res) => {
        try {
            res.json(await getPublicRooms());
        } catch (err) {
            log.error({ err }, 'failed to list rooms');
            res.status(500).json({ error: 'Failed to list rooms' });
        }
    });

    app.get("/api/stats", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.clerkUserId!;
        const [agg, recent] = await Promise.all([
          db.select({
            wins: sql<number>`COUNT(*) FILTER (WHERE result = 'win')`,
            losses: sql<number>`COUNT(*) FILTER (WHERE result = 'loss')`,
            avgScore: sql<number>`COALESCE(ROUND(AVG(score)), 0)`,
          }).from(gameHistory).where(eq(gameHistory.clerkUserId, userId)),
          db.select().from(gameHistory)
            .where(eq(gameHistory.clerkUserId, userId))
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
        const userId = req.clerkUserId!;
        const [profile] = await db.select().from(userProfiles)
          .where(eq(userProfiles.clerkId, userId))
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

    app.post("/api/users/profile", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.clerkUserId!;
        const { firstName, lastName, dateOfBirth } = req.body;
        await db.insert(userProfiles)
          .values({ clerkId: userId, firstName, lastName, dateOfBirth })
          .onConflictDoUpdate({
            target: userProfiles.clerkId,
            set: {
              firstName,
              lastName,
              dateOfBirth,
              updatedAt: sql`now()`,
            },
          });
        res.json({ ok: true });
      } catch (err) {
        log.error({ err }, 'failed to save profile');
        res.status(500).json({ error: 'Failed to save profile' });
      }
    });

    app.post("/api/game-history", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.clerkUserId!;
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
          clerkUserId: userId,
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

    app.get("/api/quests/today", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.clerkUserId!;
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

    app.post("/api/quests/claim", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.clerkUserId!;
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

    app.get("/api/achievements", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.clerkUserId!;
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
            clerkUserId: gameHistory.clerkUserId,
            firstName: userProfiles.firstName,
            wins: sql<number>`COUNT(*) FILTER (WHERE ${gameHistory.result} = 'win')`.as('wins'),
            games: sql<number>`COUNT(*)`.as('games'),
            avgScore: sql<number>`COALESCE(ROUND(AVG(${gameHistory.score}))::int, 0)`.as('avgScore'),
          })
          .from(gameHistory)
          .leftJoin(userProfiles, eq(userProfiles.clerkId, gameHistory.clerkUserId))
          .where(
            periodDays
              ? sql`${gameHistory.playedAt} > now() - interval '${sql.raw(String(periodDays))} days'`
              : sql`true`,
          )
          .groupBy(gameHistory.clerkUserId, userProfiles.firstName)
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
