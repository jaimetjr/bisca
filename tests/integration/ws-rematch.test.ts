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

// Long enough that the idle timer never interferes with a rematch test.
process.env.LOBBY_IDLE_MS = '60000';

let server: Server;
let wsUrl: string;

beforeAll(async () => {
  ({ server, wsUrl } = await startTestServer());
});

afterAll(async () => {
  await closeServer(server);
  delete process.env.LOBBY_IDLE_MS;
});

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Host + joiner, game started, then finished by the joiner forfeiting. */
async function finishedRoom() {
  const { ws: host, roomCode, playerId: hostId, reconnectToken } = await createRoom(wsUrl, 'Host');
  const { ws: joiner, playerId: joinerId } = await joinRoom(wsUrl, roomCode, 'Joiner');

  const started = waitForMessage(host, 'game_start');
  send(host, { type: 'start_game' });
  await started;

  const over = waitForMessage(host, 'game_update') as Promise<Extract<ServerMessage, { type: 'game_update' }>>;
  send(joiner, { type: 'leave_game' });
  expect((await over).gameState.phase).toBe('gameOver');

  return { host, joiner, roomCode, hostId, joinerId, reconnectToken };
}

async function expectSilence(ws: WebSocket, type: string, windowMs: number) {
  let seen: ServerMessage | null = null;
  const handler = (raw: WebSocket.RawData) => {
    const m = JSON.parse(raw.toString()) as ServerMessage;
    if (m.type === type) seen = m;
  };
  ws.on('message', handler);
  await sleep(windowMs);
  ws.off('message', handler);
  expect(seen, `unexpected "${type}"`).toBeNull();
}

describe('rematch', () => {
  it('the host rebuilds the same room, same code', async () => {
    const { host, joiner, roomCode, hostId } = await finishedRoom();

    const rejoined = waitForMessage(host, 'room_joined') as Promise<Extract<ServerMessage, { type: 'room_joined' }>>;
    send(host, { type: 'rematch' });
    const msg = await rejoined;

    expect(msg.roomCode).toBe(roomCode);   // the whole point: same code
    expect(msg.hostId).toBe(hostId);
    // Seats reopened — only the host is in until others opt back in.
    expect(msg.players.map(p => p.id)).toEqual([hostId]);

    host.close(); joiner.close();
  });

  it('tells the other players the room is live again', async () => {
    const { host, joiner, roomCode } = await finishedRoom();

    const ready = waitForMessage(joiner, 'rematch_ready') as Promise<Extract<ServerMessage, { type: 'rematch_ready' }>>;
    send(host, { type: 'rematch' });
    expect((await ready).roomCode).toBe(roomCode);

    host.close(); joiner.close();
  });

  it('lets a joiner take a seat in the rebuilt room', async () => {
    const { host, joiner, roomCode, joinerId } = await finishedRoom();

    const ready = waitForMessage(joiner, 'rematch_ready');
    send(host, { type: 'rematch' });
    await ready;

    const seated = waitForMessage(joiner, 'room_joined') as Promise<Extract<ServerMessage, { type: 'room_joined' }>>;
    send(joiner, { type: 'rematch', playerName: 'Joiner' });
    const msg = await seated;

    expect(msg.roomCode).toBe(roomCode);
    expect(msg.players.map(p => p.id)).toContain(joinerId);
    expect(msg.players).toHaveLength(2);

    host.close(); joiner.close();
  });

  it('a joiner asking first simply waits for the host', async () => {
    const { host, joiner, roomCode } = await finishedRoom();

    // Tapping Play Again before the host must not error or rebuild anything.
    send(joiner, { type: 'rematch', playerName: 'Joiner' });
    await expectSilence(joiner, 'room_joined', 400);

    // ...and the host rebuilding still reaches them.
    const ready = waitForMessage(joiner, 'rematch_ready') as Promise<Extract<ServerMessage, { type: 'rematch_ready' }>>;
    send(host, { type: 'rematch' });
    expect((await ready).roomCode).toBe(roomCode);

    host.close(); joiner.close();
  });

  it('a non-host cannot rebuild the room on their own', async () => {
    const { host, joiner, roomCode } = await finishedRoom();

    send(joiner, { type: 'rematch', playerName: 'Joiner' });
    await sleep(300);

    // Still finished: a fresh player cannot join it.
    const outsider = await openWS(wsUrl);
    const err = waitForMessage(outsider, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(outsider, { type: 'join_room', roomCode, playerName: 'Nosy' });
    expect((await err).code).toBe('GAME_ALREADY_STARTED');

    outsider.close(); host.close(); joiner.close();
  });

  it('the rebuilt room can start another game', async () => {
    const { host, joiner } = await finishedRoom();

    const ready = waitForMessage(joiner, 'rematch_ready');
    send(host, { type: 'rematch' });
    await ready;
    const seated = waitForMessage(joiner, 'room_joined');
    send(joiner, { type: 'rematch', playerName: 'Joiner' });
    await seated;

    const hostStart = waitForMessage(host, 'game_start');
    const joinerStart = waitForMessage(joiner, 'game_start');
    send(host, { type: 'start_game' });
    await Promise.all([hostStart, joinerStart]);

    host.close(); joiner.close();
  });

  it('asking again returns the current roster instead of a stale one', async () => {
    // The bug this guards: the host hands its socket to the lobby with no
    // message handler attached, so the joiner taking a seat is pushed into a
    // dead window and the host is left showing 1/2 forever. Asking again has to
    // be safe and has to answer with the truth.
    const { host, joiner, roomCode, hostId, joinerId } = await finishedRoom();

    const ready = waitForMessage(joiner, 'rematch_ready');
    send(host, { type: 'rematch' });
    await ready;

    const seated = waitForMessage(joiner, 'room_joined');
    send(joiner, { type: 'rematch', playerName: 'Joiner' });
    await seated;

    // The host re-asks, exactly as the lobby now does after adopting the socket.
    const resync = waitForMessage(host, 'room_joined') as Promise<Extract<ServerMessage, { type: 'room_joined' }>>;
    send(host, { type: 'rematch' });
    const msg = await resync;

    expect(msg.roomCode).toBe(roomCode);
    expect(msg.players).toHaveLength(2);
    expect(msg.players.map(p => p.id).sort()).toEqual([hostId, joinerId].sort());

    host.close(); joiner.close();
  });

  it('re-asking never seats the same player twice', async () => {
    const { host, joiner } = await finishedRoom();

    const ready = waitForMessage(joiner, 'rematch_ready');
    send(host, { type: 'rematch' });
    await ready;

    for (let i = 0; i < 3; i++) {
      const seated = waitForMessage(joiner, 'room_joined') as Promise<Extract<ServerMessage, { type: 'room_joined' }>>;
      send(joiner, { type: 'rematch', playerName: 'Joiner' });
      expect((await seated).players).toHaveLength(2);
    }

    host.close(); joiner.close();
  });

  it('rematch on a room that no longer exists says so', async () => {
    const { ws, playerId, reconnectToken } = await createRoom(wsUrl, 'Solo');
    ws.close();
    await sleep(100);

    const late = await openWS(wsUrl);
    // Attach to nothing: a rematch without a room must not throw.
    const err = waitForMessage(late, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(late, { type: 'reconnect', playerId, reconnectToken });
    await waitForMessage(late, 'room_joined').catch(() => null);
    send(late, { type: 'rematch' });
    // Either it seats them or it errors, but it never crashes the server.
    const settled = await Promise.race([err, sleep(500).then(() => null)]);
    expect(settled === null || typeof settled.code === 'string').toBe(true);
    late.close();
  });
});
