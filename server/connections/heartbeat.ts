import type { WebSocket, WebSocketServer } from 'ws';

/** Two ping/pong round trips fit inside the proxy's ~60s idle timeout. */
export const HEARTBEAT_INTERVAL_MS = 25_000;

const alive = new WeakSet<WebSocket>();

export function markAlive(ws: WebSocket) {
  alive.add(ws);
}

export function startHeartbeat(
  wss: WebSocketServer,
  intervalMs: number = HEARTBEAT_INTERVAL_MS,
): () => void {
  const onConnection = (ws: WebSocket) => {
    markAlive(ws);
    ws.on('pong', () => markAlive(ws));
  };
  wss.on('connection', onConnection);

  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      try {
        ws.ping();
      } catch { /* half-closed */ }
    }
  }, intervalMs);
  // tsconfig pulls in the DOM lib, so setInterval types as returning number.
  (timer as unknown as { unref?: () => void }).unref?.();

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    wss.off('connection', onConnection);
  };
  wss.on('close', stop);
  return stop;
}
