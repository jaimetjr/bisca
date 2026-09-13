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

// Production is 3 minutes with a 30s warning. Compressed here so the whole
// arc — arm, warn, close — fits inside vitest's timeout.
// Whole seconds: the warning reports secondsLeft rounded, so a sub-second lead
// would arrive as 0 and the assertion would be testing nothing.
const IDLE_MS = 1500;
const WARN_LEAD_MS = 1000;
process.env.LOBBY_IDLE_MS = String(IDLE_MS);
process.env.LOBBY_IDLE_WARNING_MS = String(WARN_LEAD_MS);

let server: Server;
let wsUrl: string;

beforeAll(async () => {
  ({ server, wsUrl } = await startTestServer());
});

afterAll(async () => {
  await closeServer(server);
  delete process.env.LOBBY_IDLE_MS;
  delete process.env.LOBBY_IDLE_WARNING_MS;
});

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

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

describe('a full lobby nobody starts', () => {
  it('warns everyone before closing the room', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    const hostWarn = waitForMessage(host, 'afk_warning') as Promise<Extract<ServerMessage, { type: 'afk_warning' }>>;
    const joinerWarn = waitForMessage(joiner, 'afk_warning');
    const warn = await hostWarn;
    await joinerWarn;

    expect(warn.secondsLeft).toBe(WARN_LEAD_MS / 1000);
    host.close(); joiner.close();
  });

  it('closes the room with LOBBY_IDLE when nobody acts', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    const errP = waitForMessage(joiner, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    const err = await errP;
    expect(err.code).toBe('LOBBY_IDLE');

    // And it really is gone.
    const late = await openWS(wsUrl);
    const goneP = waitForMessage(late, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(late, { type: 'join_room', roomCode, playerName: 'TooLate' });
    expect((await goneP).code).toBe('ROOM_NOT_FOUND');

    late.close(); host.close(); joiner.close();
  });

  it('starting the game cancels it', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    const started = waitForMessage(host, 'game_start');
    send(host, { type: 'start_game' });
    await started;

    // No warning, no close, well past the idle deadline.
    await expectNoMessage(host, 'error', IDLE_MS * 2);
    host.close(); joiner.close();
  });

  it('stay_in_lobby buys another full window', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    await sleep(WARN_LEAD_MS + 50);        // inside the warning, before the close
    send(host, { type: 'stay_in_lobby' });

    // The original deadline passes with the room still alive.
    await expectNoMessage(joiner, 'error', IDLE_MS - 100);
    host.close(); joiner.close();
  });

  it('never arms while a room is still filling up', async () => {
    // The 4-player case: sitting at 2/4 waiting for friends is correct
    // behaviour, not idleness, and must never be closed out from under them.
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host', 4);
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    await expectNoMessage(host, 'afk_warning', IDLE_MS * 2);
    host.close(); joiner.close();
  });

  it('disarms when the room stops being full', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    const leftP = waitForMessage(host, 'player_left');
    joiner.close();
    await leftP;

    await expectNoMessage(host, 'error', IDLE_MS * 2);
    host.close();
  });
});
