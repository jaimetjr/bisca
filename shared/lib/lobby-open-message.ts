export type LobbyIntent = 'create' | 'join' | 'resume' | string;

export interface LobbyOpenState {
  intent: LobbyIntent;
  reconnectToken: string;
  playerId: string;
  roomCode: string;
  /** True once this screen has created a room, so it never mints a second one. */
  hasCreated: boolean;
}

export type LobbyOpenMessage =
  | { kind: 'reconnect' }
  | { kind: 'create_room' }
  | { kind: 'join_room'; roomCode: string }
  | { kind: 'none' };

/** What the lobby sends when its socket opens. Order matters. */
export function chooseOpenMessage(s: LobbyOpenState): LobbyOpenMessage {
  if (s.reconnectToken && s.playerId) return { kind: 'reconnect' };
  if (s.intent === 'create' && !s.hasCreated) return { kind: 'create_room' };
  if (s.intent !== 'create' && s.roomCode) return { kind: 'join_room', roomCode: s.roomCode };
  // Host with no seat left: only a fresh room can succeed.
  if (s.intent === 'create') return { kind: 'create_room' };
  return { kind: 'none' };
}
