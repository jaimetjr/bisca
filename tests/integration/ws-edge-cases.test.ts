import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import {
  startTestServer, closeServer,
  openWS, createRoom, joinRoom,
  send, waitForMessage,
} from './helpers';
import type { ServerMessage } from '../../shared/lib/types/messages';
import type { GameState } from '../../shared/lib/types';

vi.mock('../../server/db', () => ({ db: {} }));
vi.mock('@clerk/backend', () => ({ verifyToken: vi.fn() }));

let server: Server;
let wsUrl: string;

beforeAll(async () => {
  ({ server, wsUrl } = await startTestServer());
});

afterAll(async () => {
  await closeServer(server);
});

describe('invalid message', () => {
  it('returns INVALID_MESSAGE for malformed JSON', async () => {
    const ws = await openWS(wsUrl);
    const errPromise = waitForMessage(ws, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    ws.send('not valid json {{{{');
    const err = await errPromise;
    expect(err.code).toBe('INVALID_MESSAGE');
    ws.close();
  });
});

describe('reconnect', () => {
  it('receives current game state on reconnect with valid token', async () => {
    // Start a 2-player game
    const { ws: hostWs, roomCode, playerId: hostId, reconnectToken } = await createRoom(wsUrl, 'Host');
    const { ws: guestWs } = await joinRoom(wsUrl, roomCode, 'Guest');

    await Promise.all([
      waitForMessage(hostWs, 'game_start'),
      waitForMessage(guestWs, 'game_start'),
      (async () => send(hostWs, { type: 'start_game' }))(),
    ]);

    // Simulate reconnect: open new WS and send reconnect with the host's playerId + token
    const newWs = await openWS(wsUrl);
    const reconnectedPromise = waitForMessage(newWs, 'reconnected') as
      Promise<Extract<ServerMessage, { type: 'reconnected' }>>;
    send(newWs, { type: 'reconnect', playerId: hostId, reconnectToken });
    const reconnected = await reconnectedPromise;

    expect(reconnected.gameState).toBeDefined();
    expect((reconnected.gameState as GameState).phase).toBe('playing');

    hostWs.close(); guestWs.close(); newWs.close();
  });

  it('rejects reconnect without a token', async () => {
    const { ws: hostWs, roomCode, playerId: hostId } = await createRoom(wsUrl, 'Host');
    const { ws: guestWs } = await joinRoom(wsUrl, roomCode, 'Guest');

    await Promise.all([
      waitForMessage(hostWs, 'game_start'),
      waitForMessage(guestWs, 'game_start'),
      (async () => send(hostWs, { type: 'start_game' }))(),
    ]);

    const newWs = await openWS(wsUrl);
    const errPromise = waitForMessage(newWs, 'error') as
      Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(newWs, { type: 'reconnect', playerId: hostId });
    const err = await errPromise;
    expect(err.code).toBe('INVALID_TOKEN');

    hostWs.close(); guestWs.close(); newWs.close();
  });

  it('rejects reconnect with a forged token', async () => {
    const { ws: hostWs, roomCode, playerId: hostId } = await createRoom(wsUrl, 'Host');
    const { ws: guestWs } = await joinRoom(wsUrl, roomCode, 'Guest');

    await Promise.all([
      waitForMessage(hostWs, 'game_start'),
      waitForMessage(guestWs, 'game_start'),
      (async () => send(hostWs, { type: 'start_game' }))(),
    ]);

    const newWs = await openWS(wsUrl);
    const errPromise = waitForMessage(newWs, 'error') as
      Promise<Extract<ServerMessage, { type: 'error' }>>;
    const forged = `${hostId}.${roomCode}.${Date.now() + 60000}.deadbeef`;
    send(newWs, { type: 'reconnect', playerId: hostId, reconnectToken: forged });
    const err = await errPromise;
    expect(err.code).toBe('INVALID_TOKEN');

    hostWs.close(); guestWs.close(); newWs.close();
  });
});

describe('input validation', () => {
  it('rejects malformed payload (missing required field) as INVALID_MESSAGE', async () => {
    const ws = await openWS(wsUrl);
    const errPromise = waitForMessage(ws, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    // create_room without playerName/maxPlayers
    ws.send(JSON.stringify({ type: 'create_room' }));
    const err = await errPromise;
    expect(err.code).toBe('INVALID_MESSAGE');
    ws.close();
  });

  it('rejects unknown message type as INVALID_MESSAGE', async () => {
    const ws = await openWS(wsUrl);
    const errPromise = waitForMessage(ws, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    ws.send(JSON.stringify({ type: 'totally_made_up', foo: 'bar' }));
    const err = await errPromise;
    expect(err.code).toBe('INVALID_MESSAGE');
    ws.close();
  });
});

describe('public rooms filter', () => {
  it('does not list in-progress games', async () => {
    const { ws: hostWs, roomCode } = await createRoom(wsUrl, 'PlayingHost', 2, true);
    const { ws: guestWs } = await joinRoom(wsUrl, roomCode, 'Guest');

    await Promise.all([
      waitForMessage(hostWs, 'game_start'),
      waitForMessage(guestWs, 'game_start'),
      (async () => send(hostWs, { type: 'start_game' }))(),
    ]);

    // Import getPublicRooms indirectly via the HTTP route
    const { default: request } = await import('supertest');
    const res = await request(server).get('/api/rooms');
    const room = res.body.find((r: { code: string }) => r.code === roomCode);
    expect(room).toBeUndefined();

    hostWs.close(); guestWs.close();
  });
});
