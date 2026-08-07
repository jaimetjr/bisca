import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { startTestServer, closeServer, openWS, send, waitForMessage } from './helpers';
import type { ServerMessage } from '../../shared/lib/types/messages';

vi.mock('../../server/db', () => ({ db: {} }));

let server: Server;
let wsUrl: string;

type ErrorMessage = Extract<ServerMessage, { type: 'error' }>;

/**
 * The gate ships disabled (floor '0.0.0'), which is what every other WS test
 * runs against — those files passing is the proof it is inert by default.
 * Here the floor is raised so the blocking path itself is exercised.
 */
beforeAll(async () => {
  process.env.MIN_APP_VERSION = '2.0.0';
  ({ server, wsUrl } = await startTestServer());
});

afterAll(async () => {
  await closeServer(server);
  delete process.env.MIN_APP_VERSION;
});

async function expectRejected(msg: Parameters<typeof send>[1]): Promise<ErrorMessage> {
  const ws = await openWS(wsUrl);
  try {
    const promise = waitForMessage(ws, 'error') as Promise<ErrorMessage>;
    send(ws, msg);
    return await promise;
  } finally {
    // Without this a failing expectation leaks the socket and closeServer()
    // hangs in afterAll, burying the real failure under a hook timeout.
    ws.close();
  }
}

describe('gate de versão mínima', () => {
  it('barra create_room de um build sem appVersion', async () => {
    // The builds already in the store send no version at all — the case the
    // gate exists for.
    const error = await expectRejected({ type: 'create_room', playerName: 'Host', maxPlayers: 2 });
    expect(error.code).toBe('APP_OUTDATED');
  });

  it('barra create_room de um build abaixo do piso', async () => {
    const error = await expectRejected({
      type: 'create_room', playerName: 'Host', maxPlayers: 2, appVersion: '1.1.0',
    });
    expect(error.code).toBe('APP_OUTDATED');
  });

  it('manda uma mensagem legível junto do código', async () => {
    // Old clients do not know the code and fall back to `message` (see
    // wsErrorText in shared/lib/api-errors.ts), so the sentence has to stand
    // on its own.
    const error = await expectRejected({ type: 'create_room', playerName: 'Host', maxPlayers: 2 });
    expect(error.message).toMatch(/update/i);
  });

  it('deixa passar um build no piso', async () => {
    const ws = await openWS(wsUrl);
    const promise = waitForMessage(ws, 'room_created');
    send(ws, { type: 'create_room', playerName: 'Host', maxPlayers: 2, appVersion: '2.0.0' });
    const msg = await promise as Extract<ServerMessage, { type: 'room_created' }>;
    expect(msg.roomCode).toHaveLength(5);
    ws.close();
  });

  it('deixa passar um build acima do piso', async () => {
    const ws = await openWS(wsUrl);
    const promise = waitForMessage(ws, 'room_created');
    send(ws, { type: 'create_room', playerName: 'Host', maxPlayers: 2, appVersion: '2.10.0' });
    const msg = await promise as Extract<ServerMessage, { type: 'room_created' }>;
    expect(msg.roomCode).toHaveLength(5);
    ws.close();
  });

  it('barra join_room de um build abaixo do piso', async () => {
    const host = await openWS(wsUrl);
    const created = waitForMessage(host, 'room_created');
    send(host, { type: 'create_room', playerName: 'Host', maxPlayers: 2, appVersion: '2.0.0' });
    const { roomCode } = await created as Extract<ServerMessage, { type: 'room_created' }>;

    const error = await expectRejected({
      type: 'join_room', roomCode, playerName: 'Joiner', appVersion: '1.1.0',
    });
    expect(error.code).toBe('APP_OUTDATED');
    host.close();
  });

  it('barra reconnect de um build abaixo do piso', async () => {
    // No valid token here on purpose: the version check has to run before
    // anything else, so an outdated client learns to update rather than
    // getting INVALID_TOKEN and retrying forever.
    const error = await expectRejected({
      type: 'reconnect', playerId: 'p-nonexistent', appVersion: '1.1.0',
    });
    expect(error.code).toBe('APP_OUTDATED');
  });
});
