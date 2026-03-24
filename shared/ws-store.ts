let _ws: WebSocket | null = null;
let _playerId = '';

export function storeGameWs(ws: WebSocket, playerId: string) {
  _ws = ws;
  _playerId = playerId;
}

/** One-time handoff — clears the store after returning. */
export function takeGameWs(): { ws: WebSocket; playerId: string } | null {
  if (!_ws) return null;
  const result = { ws: _ws, playerId: _playerId };
  _ws = null;
  _playerId = '';
  return result;
}
