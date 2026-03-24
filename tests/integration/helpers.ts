import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import type { ServerMessage, ClientMessage } from '../../shared/lib/types/messages';

export async function startTestServer(): Promise<{ server: Server; port: number; wsUrl: string }> {
  // Dynamically import registerRoutes AFTER mocks are set up
  const { registerRoutes } = await import('../../server/routes');
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, port, wsUrl: `ws://127.0.0.1:${port}` };
}

export function closeServer(server: Server): Promise<void> {
  return new Promise(resolve => {
    // Force-close any lingering connections (Node ≥18.2)
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    server.close(() => resolve());
  });
}

export function connectWS(wsUrl: string): WebSocket {
  return new WebSocket(wsUrl);
}

export function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

export function waitForMessage(ws: WebSocket, type: string, timeoutMs = 5000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for message type "${type}"`)),
      timeoutMs,
    );
    const handler = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

export function send(ws: WebSocket, msg: ClientMessage): void {
  ws.send(JSON.stringify(msg));
}

/** Connect, wait for open, return the WS. */
export async function openWS(wsUrl: string): Promise<WebSocket> {
  const ws = connectWS(wsUrl);
  await waitForOpen(ws);
  return ws;
}

/** Convenience: create a room and return the room_created payload. */
export async function createRoom(
  wsUrl: string,
  playerName = 'Host',
  maxPlayers = 2,
  isPublic = false,
): Promise<{ ws: WebSocket; roomCode: string; playerId: string }> {
  const ws = await openWS(wsUrl);
  const msgPromise = waitForMessage(ws, 'room_created');
  send(ws, { type: 'create_room', playerName, maxPlayers, isPublic });
  const msg = await msgPromise as Extract<ServerMessage, { type: 'room_created' }>;
  return { ws, roomCode: msg.roomCode, playerId: msg.playerId };
}

/** Convenience: join a room and return the room_joined payload. */
export async function joinRoom(
  wsUrl: string,
  roomCode: string,
  playerName = 'Joiner',
): Promise<{ ws: WebSocket; playerId: string }> {
  const ws = await openWS(wsUrl);
  const msgPromise = waitForMessage(ws, 'room_joined');
  send(ws, { type: 'join_room', roomCode, playerName });
  const msg = await msgPromise as Extract<ServerMessage, { type: 'room_joined' }>;
  return { ws, playerId: msg.playerId };
}
