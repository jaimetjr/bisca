import { Card, GameState } from '../types';

// ─── Client → Server ────────────────────────────────────────────────────────

export interface PublicRoomInfo {
  code: string;
  hostName: string;
  maxPlayers: number;
  currentPlayers: number;
  mode: '1v1' | '2v2';
}

// `appVersion` is the client's own app.json version, carried on the three
// messages that enter a room so the server can turn away builds too old for
// the current protocol (see MIN_APP_VERSION in server/game-rooms.ts). It stays
// optional forever: the builds already installed do not send it, and a missing
// value is read as "oldest possible".
export type ClientMessage =
  | { type: 'create_room'; playerName: string; maxPlayers: number; isPublic?: boolean; strictFollowSuit?: boolean; appVersion?: string }
  | { type: 'join_room'; roomCode: string; playerName: string; preferredTeam?: 0 | 1; appVersion?: string }
  | { type: 'switch_team'; team: 0 | 1 }
  | { type: 'start_game' }
  | { type: 'play_card'; cardId: string }
  | { type: 'reconnect'; playerId: string; reconnectToken?: string; appVersion?: string }
  | { type: 'leave_game' }
  // Client-initiated: protocol ping frames never surface to JS.
  | { type: 'ping' }
  // Buys another idle window for a full lobby that has been warned.
  | { type: 'stay_in_lobby' }
  // From the host, rebuilds the room in place; from anyone else, claims a seat.
  | { type: 'rematch'; playerName?: string }
  // Restarts the turn timer. Ignored from anyone but the player on the clock.
  | { type: 'still_here' };

// ─── Server → Client ────────────────────────────────────────────────────────

export type ServerMessage =
  // `hostId` lets a resumed client tell whether it is the host.
  | { type: 'room_created'; roomCode: string; playerId: string; reconnectToken: string; players: RoomPlayerInfo[]; maxPlayers: number; hostId?: string }
  | { type: 'room_joined'; roomCode: string; playerId: string; reconnectToken: string; players: RoomPlayerInfo[]; maxPlayers: number; hostId?: string }
  | { type: 'player_joined'; players: RoomPlayerInfo[] }
  | { type: 'player_left'; players: RoomPlayerInfo[] }
  | { type: 'game_start'; gameState: GameState; playerId: string }
  | { type: 'game_update'; gameState: GameState }
  | { type: 'error'; message: string; code: ErrorCode }
  | { type: 'reconnected'; gameState: GameState }
  // `playerId` names the player on the clock; absent on the lobby idle warning.
  | { type: 'afk_warning'; secondsLeft: number; playerId?: string }
  | { type: 'pong' }
  // The host rebuilt the room; sent to everyone who was in it.
  | { type: 'rematch_ready'; roomCode: string }
  // Presence only: being away is not a loss.
  | { type: 'presence'; playerId: string; connected: boolean };

export interface RoomPlayerInfo {
  id: string;
  name: string;
  team?: 0 | 1;
  /** False while inside a disconnect grace window. */
  connected?: boolean;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_ALREADY_STARTED'
  | 'INVALID_CARD'
  | 'MUST_FOLLOW_SUIT'
  | 'NOT_YOUR_TURN'
  | 'AUTH_REQUIRED'
  | 'INVALID_MESSAGE'
  | 'INVALID_TOKEN'
  | 'NEED_MORE_PLAYERS'
  | 'NOT_HOST'
  | 'HOST_LEFT'
  | 'LOBBY_IDLE'
  | 'RATE_LIMITED'
  | 'FORBIDDEN_ORIGIN'
  | 'APP_OUTDATED';
