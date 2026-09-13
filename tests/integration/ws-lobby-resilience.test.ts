import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import type WebSocket from 'ws';
import {
  startTestServer, closeServer,
  openWS, createRoom, joinRoom,
  send, waitForMessage,
} from './helpers';
import type { ServerMessage } from '../../shared/lib/types/messages';

vi.mock('../../server/db', () => ({ db: {} }));

// The real grace is 2 minutes; vitest's default timeout is 10s. Every test here
// depends on watching the window open and then close, so it has to be short.
// Set before startTestServer so the server never sees the production default.
const GRACE_MS = 400;
process.env.LOBBY_GRACE_MS = String(GRACE_MS);

let server: Server;
let wsUrl: string;

beforeAll(async () => {
  ({ server, wsUrl } = await startTestServer());
});

afterAll(async () => {
  await closeServer(server);
  delete process.env.LOBBY_GRACE_MS;
});

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Fails if a message of `type` arrives within the window. */
async function expectNoMessage(ws: WebSocket, type: string, windowMs: number): Promise<void> {
  let seen: ServerMessage | null = null;
  const handler = (raw: WebSocket.RawData) => {
    const msg = JSON.parse(raw.toString()) as ServerMessage;
    if (msg.type === type) seen = msg;
  };
  ws.on('message', handler);
  await sleep(windowMs);
  ws.off('message', handler);
  expect(seen, `unexpected "${type}" within ${windowMs}ms`).toBeNull();
}

describe('lobby survives a host disconnect', () => {
  it('the room still exists while the host is inside the grace window', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
    host.close();
    await sleep(GRACE_MS / 2);

    // A brand-new player can still find the code the host shared.
    const joiner = await openWS(wsUrl);
    const joined = waitForMessage(joiner, 'room_joined') as Promise<Extract<ServerMessage, { type: 'room_joined' }>>;
    send(joiner, { type: 'join_room', roomCode, playerName: 'Joiner' });
    expect((await joined).roomCode).toBe(roomCode);
    joiner.close();
  });

  it('reconnect into a waiting room returns the lobby state', async () => {
    const { ws: host, roomCode, playerId, reconnectToken } = await createRoom(wsUrl, 'Host');
    host.close();
    await sleep(GRACE_MS / 2);

    const revived = await openWS(wsUrl);
    const rejoined = waitForMessage(revived, 'room_joined') as Promise<Extract<ServerMessage, { type: 'room_joined' }>>;
    send(revived, { type: 'reconnect', playerId, reconnectToken });
    const msg = await rejoined;

    expect(msg.roomCode).toBe(roomCode);
    expect(msg.playerId).toBe(playerId);
    expect(msg.hostId).toBe(playerId);
    expect(msg.players.map(p => p.name)).toContain('Host');
    revived.close();
  });

  it('a reclaimed host can still start the game', async () => {
    const { ws: host, roomCode, playerId, reconnectToken } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    host.close();
    await sleep(GRACE_MS / 2);

    const revived = await openWS(wsUrl);
    const rejoined = waitForMessage(revived, 'room_joined');
    send(revived, { type: 'reconnect', playerId, reconnectToken });
    await rejoined;

    const hostStart = waitForMessage(revived, 'game_start');
    const joinerStart = waitForMessage(joiner, 'game_start');
    send(revived, { type: 'start_game' });
    await Promise.all([hostStart, joinerStart]);

    revived.close();
    joiner.close();
  });

  it('marks the host disconnected, then connected again on reconnect', async () => {
    const { ws: host, roomCode, playerId, reconnectToken } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    const leftPromise = waitForMessage(joiner, 'player_left') as Promise<Extract<ServerMessage, { type: 'player_left' }>>;
    host.close();
    const left = await leftPromise;

    // The host keeps its seat — it is flagged, not removed.
    const hostRow = left.players.find(p => p.id === playerId);
    expect(hostRow).toBeDefined();
    expect(hostRow?.connected).toBe(false);

    const backPromise = waitForMessage(joiner, 'player_joined') as Promise<Extract<ServerMessage, { type: 'player_joined' }>>;
    const revived = await openWS(wsUrl);
    send(revived, { type: 'reconnect', playerId, reconnectToken });
    const back = await backPromise;
    expect(back.players.find(p => p.id === playerId)?.connected).toBe(true);

    revived.close();
    joiner.close();
  });

  it('a host who reconnects does not get torn down when the grace expires', async () => {
    const { ws: host, roomCode, playerId, reconnectToken } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    host.close();
    const revived = await openWS(wsUrl);
    const rejoined = waitForMessage(revived, 'room_joined');
    send(revived, { type: 'reconnect', playerId, reconnectToken });
    await rejoined;

    // Sit past the window the close-handler armed.
    await expectNoMessage(joiner, 'error', GRACE_MS * 2);

    revived.close();
    joiner.close();
  });

  it('still tears the room down when the host never comes back', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    const errPromise = waitForMessage(joiner, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    host.close();
    expect((await errPromise).code).toBe('HOST_LEFT');

    const late = await openWS(wsUrl);
    const gone = waitForMessage(late, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(late, { type: 'join_room', roomCode, playerName: 'TooLate' });
    expect((await gone).code).toBe('ROOM_NOT_FOUND');

    late.close();
    joiner.close();
  });

  it('a non-host who disconnects is still removed immediately', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    const leftPromise = waitForMessage(host, 'player_left') as Promise<Extract<ServerMessage, { type: 'player_left' }>>;
    joiner.close();
    expect((await leftPromise).players).toHaveLength(1);
    host.close();
  });
});

describe('keepalive', () => {
  it('answers ping with pong', async () => {
    const ws = await openWS(wsUrl);
    const pong = waitForMessage(ws, 'pong');
    send(ws, { type: 'ping' });
    expect((await pong).type).toBe('pong');
    ws.close();
  });

  it('answers ping from a socket that has joined no room', async () => {
    const ws = await openWS(wsUrl);
    const pong = waitForMessage(ws, 'pong');
    send(ws, { type: 'ping' });
    await pong;
    ws.close();
  });

  it('ping does not count as room activity', async () => {
    const { ws, roomCode } = await createRoom(wsUrl, 'Host');
    const { getRoomStore } = await import('../../server/stores');
    const before = (await getRoomStore().get(roomCode))!.lastActivityAt;

    await sleep(20);
    const pong = waitForMessage(ws, 'pong');
    send(ws, { type: 'ping' });
    await pong;

    const after = (await getRoomStore().get(roomCode))!.lastActivityAt;
    expect(after).toBe(before);
    ws.close();
  });

  it('still rejects an unknown message type', async () => {
    const ws = await openWS(wsUrl);
    const err = waitForMessage(ws, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    ws.send(JSON.stringify({ type: 'pingg' }));
    expect((await err).code).toBe('INVALID_MESSAGE');
    ws.close();
  });
});
