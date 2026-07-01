import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, serial, date, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users ──────────────────────────────────────────────────────────────────
// Self-hosted auth: credentials (email + bcrypt hash) live alongside the
// profile fields. `id` is the canonical user identifier used as the foreign
// key across game history, achievements and quests.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// One-time 6-digit codes for email verification and password reset. The code
// itself is never stored — only a bcrypt hash. Codes expire and are
// attempt-limited to make brute-forcing a 6-digit code infeasible.
export const authCodes = pgTable(
  "auth_codes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    purpose: text("purpose").notNull(), // 'email_verify' | 'password_reset'
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userPurposeIdx: index("auth_codes_user_purpose_idx").on(t.userId, t.purpose),
  }),
);

export type AuthCode = typeof authCodes.$inferSelect;

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const gameHistory = pgTable("game_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  result: text("result").notNull(), // 'win' | 'loss' | 'draw'
  score: integer("score").notNull(),
  opponentScore: integer("opponent_score").notNull(),
  mode: text("mode").notNull(), // 'ai' | 'online'
  aiDifficulty: text("ai_difficulty"), // only for ai mode
  playedAt: timestamp("played_at", { withTimezone: true }).defaultNow(),
});

export const insertGameHistorySchema = createInsertSchema(gameHistory).omit({ id: true, playedAt: true });
export type InsertGameHistory = z.infer<typeof insertGameHistorySchema>;
export type GameHistory = typeof gameHistory.$inferSelect;

// ─── Achievements (cosmetic only — no gameplay effects) ─────────────────────
// Catalog lives in shared/lib/achievements/definitions.ts; this table only
// records WHICH cosmetic badges a user has unlocked. The achievement_id is a
// slug that maps back to the catalog entry.
export const userAchievements = pgTable(
  "user_achievements",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    achievementId: text("achievement_id").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdx: index("user_achievements_user_idx").on(t.userId),
    uniq: uniqueIndex("user_achievements_unique").on(t.userId, t.achievementId),
  }),
);

export type UserAchievement = typeof userAchievements.$inferSelect;

// ─── Daily quests (cosmetic XP only — no gameplay effects) ──────────────────
// Three quests are picked deterministically per UTC day (see
// shared/lib/quests/evaluator.ts). One row per (user, date, questId). Progress
// is incremented server-side as games are recorded; `claimed` flips to true
// when the user redeems the cosmetic XP reward.
export const userQuestProgress = pgTable(
  "user_quest_progress",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    questId: text("quest_id").notNull(),
    questDate: date("quest_date").notNull(), // 'YYYY-MM-DD' UTC
    progress: integer("progress").notNull().default(0),
    target: integer("target").notNull(),
    claimed: boolean("claimed").notNull().default(false),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (t) => ({
    userDateIdx: index("user_quest_progress_user_date_idx").on(t.userId, t.questDate),
    uniq: uniqueIndex("user_quest_progress_unique").on(t.userId, t.questDate, t.questId),
  }),
);

export type UserQuestProgress = typeof userQuestProgress.$inferSelect;
