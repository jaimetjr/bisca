import { z } from 'zod';
import { ROOM_CODE_LENGTH, PLAYER_NAME_MAX_LENGTH } from '../../constants/game';

const playerName = z
  .string()
  .trim()
  .min(1)
  .max(PLAYER_NAME_MAX_LENGTH);

const roomCode = z
  .string()
  .trim()
  .length(ROOM_CODE_LENGTH)
  .regex(/^[A-Z2-9]+$/i);

const playerId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.-]+$/);

const cardId = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/);

const team = z.union([z.literal(0), z.literal(1)]);

// Deliberately loose: only bounded, never pattern-checked. A malformed version
// must reach the gate and be read as "too old", not blow up as INVALID_MESSAGE
// — that error tells the player nothing about what to do. Zod strips unknown
// keys, so the field has to be declared here or the gate never sees it.
const appVersion = z.string().max(32).optional();

export const createRoomSchema = z.object({
  type: z.literal('create_room'),
  playerName,
  maxPlayers: z.number().int().min(2).max(4),
  isPublic: z.boolean().optional(),
  strictFollowSuit: z.boolean().optional(),
  appVersion,
});

export const joinRoomSchema = z.object({
  type: z.literal('join_room'),
  roomCode,
  playerName,
  preferredTeam: team.optional(),
  appVersion,
});

export const switchTeamSchema = z.object({
  type: z.literal('switch_team'),
  team,
});

export const startGameSchema = z.object({
  type: z.literal('start_game'),
});

export const playCardSchema = z.object({
  type: z.literal('play_card'),
  cardId,
});

export const reconnectSchema = z.object({
  type: z.literal('reconnect'),
  playerId,
  reconnectToken: z.string().min(1).max(512).optional(),
  appVersion,
});

export const leaveGameSchema = z.object({
  type: z.literal('leave_game'),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  createRoomSchema,
  joinRoomSchema,
  switchTeamSchema,
  startGameSchema,
  playCardSchema,
  reconnectSchema,
  leaveGameSchema,
]);

export type ValidatedClientMessage = z.infer<typeof clientMessageSchema>;
