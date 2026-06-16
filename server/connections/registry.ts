import { WebSocket } from 'ws';

interface PlayerLocation {
  playerId: string;
  roomCode: string;
}

const wsToPlayer = new Map<WebSocket, PlayerLocation>();
const playerToWs = new Map<string, WebSocket>();

export function attachConnection(ws: WebSocket, playerId: string, roomCode: string) {
  // If this player already had a different live socket, drop the old mapping
  const previous = playerToWs.get(playerId);
  if (previous && previous !== ws) {
    wsToPlayer.delete(previous);
  }
  wsToPlayer.set(ws, { playerId, roomCode });
  playerToWs.set(playerId, ws);
}

export function detachByWs(ws: WebSocket): PlayerLocation | undefined {
  const loc = wsToPlayer.get(ws);
  if (!loc) return undefined;
  wsToPlayer.delete(ws);
  // Only clear playerToWs if it still points at this socket (a reconnect may have replaced it)
  if (playerToWs.get(loc.playerId) === ws) {
    playerToWs.delete(loc.playerId);
  }
  return loc;
}

export function getLocation(ws: WebSocket): PlayerLocation | undefined {
  return wsToPlayer.get(ws);
}

export function getWsForPlayer(playerId: string): WebSocket | undefined {
  return playerToWs.get(playerId);
}
