import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, serial, date, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

export const gameHistory = pgTable("game_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clerkUserId: text("clerk_user_id").notNull(),
  result: text("result").notNull(), // 'win' | 'loss' | 'draw'
  score: integer("score").notNull(),
  opponentScore: integer("opponent_score").notNull(),
  mode: text("mode").notNull(), // 'ai' | 'online'
  aiDifficulty: text("ai_difficulty"), // only for ai mode
  playedAt: timestamp("played_at").defaultNow(),
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
    clerkUserId: text("clerk_user_id").notNull(),
    achievementId: text("achievement_id").notNull(),
    unlockedAt: timestamp("unlocked_at").defaultNow(),
  },
  (t) => ({
    userIdx: index("user_achievements_user_idx").on(t.clerkUserId),
    uniq: uniqueIndex("user_achievements_unique").on(t.clerkUserId, t.achievementId),
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
    clerkUserId: text("clerk_user_id").notNull(),
    questId: text("quest_id").notNull(),
    questDate: date("quest_date").notNull(), // 'YYYY-MM-DD' UTC
    progress: integer("progress").notNull().default(0),
    target: integer("target").notNull(),
    claimed: boolean("claimed").notNull().default(false),
    claimedAt: timestamp("claimed_at"),
  },
  (t) => ({
    userDateIdx: index("user_quest_progress_user_date_idx").on(t.clerkUserId, t.questDate),
    uniq: uniqueIndex("user_quest_progress_unique").on(t.clerkUserId, t.questDate, t.questId),
  }),
);

export type UserQuestProgress = typeof userQuestProgress.$inferSelect;
