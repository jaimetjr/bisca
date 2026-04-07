import './types';
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { handleWebSocket, getPublicRooms } from './game-rooms';
import { db } from './db';
import { gameHistory, userProfiles } from '../shared/lib/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { verifyToken } from '@clerk/backend';

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
    console.error('Token verification failed:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    app.get("/api/rooms", (_req, res) => {
        res.json(getPublicRooms());
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
        console.error('Failed to save profile:', err);
        res.status(500).json({ error: 'Failed to save profile' });
      }
    });

    app.post("/api/game-history", requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.clerkUserId!;
        const { result, score, opponentScore, mode, aiDifficulty } = req.body;
        await db.insert(gameHistory).values({ clerkUserId: userId, result, score, opponentScore, mode, aiDifficulty });
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Failed to save game' });
      }
    });

    const httpServer = createServer(app);

    const wss = new WebSocketServer({ server: httpServer, path: "/" });

    wss.on("connection", (ws) => {
        handleWebSocket(ws);
    });

    return httpServer;
}
