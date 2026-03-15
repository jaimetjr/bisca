import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, serial, date } from "drizzle-orm/pg-core";
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
