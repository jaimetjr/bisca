import { Card, GameState } from '../types';

// ─── Client → Server ────────────────────────────────────────────────────────

export interface PublicRoomInfo {
  code: string;
  hostName: string;
  maxPlayers: number;
  currentPlayers: number;
  mode: '1v1' | '2v2';
}

export type ClientMessage =
  | { type: 'create_room'; playerName: string; maxPlayers: number; isPublic?: boolean; strictFollowSuit?: boolean; clerkToken?: string }
  | { type: 'join_room'; roomCode: string; playerName: string; preferredTeam?: 0 | 1; clerkToken?: string }
  | { type: 'switch_team'; team: 0 | 1 }
  | { type: 'start_game' }
  | { type: 'play_card'; cardId: string }
  | { type: 'reconnect'; playerId: string; reconnectToken?: string }
  | { type: 'leave_game' };

// ─── Server → Client ────────────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'room_created'; roomCode: string; playerId: string; reconnectToken: string; players: RoomPlayerInfo[]; maxPlayers: number }
  | { type: 'room_joined'; roomCode: string; playerId: string; reconnectToken: string; players: RoomPlayerInfo[]; maxPlayers: number }
  | { type: 'player_joined'; players: RoomPlayerInfo[] }
  | { type: 'player_left'; players: RoomPlayerInfo[] }
  | { type: 'game_start'; gameState: GameState; playerId: string }
  | { type: 'game_update'; gameState: GameState }
  | { type: 'error'; message: string; code: ErrorCode }
  | { type: 'reconnected'; gameState: GameState }
  | { type: 'afk_warning'; secondsLeft: number };

export interface RoomPlayerInfo {
  id: string;
  name: string;
  team?: 0 | 1;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_ALREADY_STARTED'
  | 'INVALID_CARD'
  | 'NOT_YOUR_TURN'
  | 'AUTH_REQUIRED'
  | 'INVALID_MESSAGE'
  | 'INVALID_TOKEN'
  | 'NEED_MORE_PLAYERS'
  | 'NOT_HOST'
  | 'HOST_LEFT'
  | 'RATE_LIMITED'
  | 'FORBIDDEN_ORIGIN';
