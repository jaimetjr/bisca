import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import {
  startTestServer, closeServer,
  openWS, createRoom, joinRoom,
  send, waitForMessage,
} from './helpers';
import type { ServerMessage } from '../../shared/lib/types/messages';

vi.mock('../../server/db', () => ({ db: {} }));

let server: Server;
let wsUrl: string;

beforeAll(async () => {
  ({ server, wsUrl } = await startTestServer());
});

afterAll(async () => {
  await closeServer(server);
});

describe('create_room', () => {
  it('returns room_created with a 5-char code', async () => {
    const { ws, roomCode, playerId } = await createRoom(wsUrl);
    expect(roomCode).toHaveLength(5);
    expect(playerId).toBeTruthy();
    ws.close();
  });

  it('maxPlayers is echoed back', async () => {
    const ws = await openWS(wsUrl);
    const promise = waitForMessage(ws, 'room_created') as Promise<Extract<ServerMessage, { type: 'room_created' }>>;
    send(ws, { type: 'create_room', playerName: 'Host', maxPlayers: 4 });
    const msg = await promise;
    expect(msg.maxPlayers).toBe(4);
    ws.close();
  });

  it('each room gets a unique code', async () => {
    const { ws: ws1, roomCode: code1 } = await createRoom(wsUrl);
    const { ws: ws2, roomCode: code2 } = await createRoom(wsUrl);
    expect(code1).not.toBe(code2);
    ws1.close();
    ws2.close();
  });
});

describe('join_room', () => {
  it('returns room_joined to the joiner', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl);
    const { ws: joiner, playerId } = await joinRoom(wsUrl, roomCode, 'Joiner');
    expect(playerId).toBeTruthy();
    host.close();
    joiner.close();
  });

  it('host receives player_joined broadcast', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl);
    const joinedPromise = waitForMessage(host, 'player_joined');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');
    const msg = await joinedPromise as Extract<ServerMessage, { type: 'player_joined' }>;
    expect(msg.players).toHaveLength(2);
    host.close();
    joiner.close();
  });

  it('returns ROOM_NOT_FOUND for an invalid code', async () => {
    const ws = await openWS(wsUrl);
    const errPromise = waitForMessage(ws, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(ws, { type: 'join_room', roomCode: 'XXXXX', playerName: 'Nobody' });
    const err = await errPromise;
    expect(err.code).toBe('ROOM_NOT_FOUND');
    ws.close();
  });

  it('returns ROOM_FULL when room is at capacity', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host', 2);
    const { ws: p2 } = await joinRoom(wsUrl, roomCode, 'P2');
    // Room is now full — third player should be rejected
    const ws3 = await openWS(wsUrl);
    const errPromise = waitForMessage(ws3, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(ws3, { type: 'join_room', roomCode, playerName: 'P3' });
    const err = await errPromise;
    expect(err.code).toBe('ROOM_FULL');
    host.close();
    p2.close();
    ws3.close();
  });

  it('returns GAME_ALREADY_STARTED after the game begins', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host', 2);
    const { ws: p2 } = await joinRoom(wsUrl, roomCode, 'P2');
    // Start the game
    const startPromise = waitForMessage(host, 'game_start');
    send(host, { type: 'start_game' });
    await startPromise;
    // Late joiner
    const late = await openWS(wsUrl);
    const errPromise = waitForMessage(late, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(late, { type: 'join_room', roomCode, playerName: 'Late' });
    const err = await errPromise;
    expect(err.code).toBe('GAME_ALREADY_STARTED');
    host.close();
    p2.close();
    late.close();
  });
});

describe('switch_team', () => {
  it('moves player to the target team and broadcasts update', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host', 4);
    // host is on team 0; joiner auto-assigned to team 1
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    // Joiner wants to switch to team 0
    const updatePromise = waitForMessage(joiner, 'player_joined') as Promise<Extract<ServerMessage, { type: 'player_joined' }>>;
    send(joiner, { type: 'switch_team', team: 0 });
    const update = await updatePromise;
    const joinerInfo = update.players.find(p => p.name === 'Joiner');
    expect(joinerInfo?.team).toBe(0);
    host.close();
    joiner.close();
  });

  it('returns ROOM_FULL when target team already has 2 players', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host', 4);
    const { ws: p2 } = await joinRoom(wsUrl, roomCode, 'P2'); // team 1
    const { ws: p3 } = await joinRoom(wsUrl, roomCode, 'P3'); // team 0
    const { ws: p4 } = await joinRoom(wsUrl, roomCode, 'P4'); // team 1

    // p4 is on team 1 and tries to switch to team 0 (already has host + p3)
    const errPromise = waitForMessage(p4, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(p4, { type: 'switch_team', team: 0 });
    const err = await errPromise;
    expect(err.code).toBe('ROOM_FULL');
    host.close(); p2.close(); p3.close(); p4.close();
  });
});

describe('disconnect handling', () => {
  it('HOST_LEFT: remaining players notified when host disconnects', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    const errPromise = waitForMessage(joiner, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    host.close();
    const err = await errPromise;
    expect(err.code).toBe('HOST_LEFT');
    joiner.close();
  });

  it('player_left: host notified when non-host disconnects', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl);
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    const leftPromise = waitForMessage(host, 'player_left') as Promise<Extract<ServerMessage, { type: 'player_left' }>>;
    joiner.close();
    const msg = await leftPromise;
    expect(msg.players).toHaveLength(1);
    host.close();
  });
});
