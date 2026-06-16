let _ws: WebSocket | null = null;
let _playerId = '';
let _reconnectToken = '';

export function storeGameWs(ws: WebSocket, playerId: string, reconnectToken: string) {
  _ws = ws;
  _playerId = playerId;
  _reconnectToken = reconnectToken;
}

/** One-time handoff — clears the store after returning. */
export function takeGameWs(): { ws: WebSocket; playerId: string; reconnectToken: string } | null {
  if (!_ws) return null;
  const result = { ws: _ws, playerId: _playerId, reconnectToken: _reconnectToken };
  _ws = null;
  _playerId = '';
  _reconnectToken = '';
  return result;
}
