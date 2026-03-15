import { Card, GameState } from '../types';

// ─── Client → Server ────────────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'create_room'; playerName: string; maxPlayers: number; clerkToken?: string }
  | { type: 'join_room'; roomCode: string; playerName: string; clerkToken?: string }
  | { type: 'start_game' }
  | { type: 'play_card'; cardId: string }
  | { type: 'reconnect'; playerId: string };

// ─── Server → Client ────────────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'room_created'; roomCode: string; playerId: string; players: RoomPlayerInfo[]; maxPlayers: number }
  | { type: 'room_joined'; roomCode: string; playerId: string; players: RoomPlayerInfo[]; maxPlayers: number }
  | { type: 'player_joined'; players: RoomPlayerInfo[] }
  | { type: 'player_left'; players: RoomPlayerInfo[] }
  | { type: 'game_start'; gameState: GameState; playerId: string }
  | { type: 'game_update'; gameState: GameState }
  | { type: 'error'; message: string; code: ErrorCode }
  | { type: 'reconnected'; gameState: GameState };

export interface RoomPlayerInfo {
  id: string;
  name: string;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_ALREADY_STARTED'
  | 'INVALID_CARD'
  | 'NOT_YOUR_TURN'
  | 'AUTH_REQUIRED'
  | 'INVALID_MESSAGE'
  | 'NEED_MORE_PLAYERS'
  | 'NOT_HOST';
