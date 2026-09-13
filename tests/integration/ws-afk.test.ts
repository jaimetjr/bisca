import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import type WebSocket from 'ws';
import {
  startTestServer, closeServer,
  createRoom, joinRoom, send, waitForMessage,
} from './helpers';
import type { ServerMessage } from '../../shared/lib/types/messages';

vi.mock('../../server/db', () => ({ db: {} }));

// Production is 120s with a 30s warning, compressed here so a turn can be
// allowed to time out inside vitest's budget.
const AFK_MS = 1500;
const WARN_LEAD_MS = 1000;
process.env.AFK_TIMEOUT_MS = String(AFK_MS);
process.env.AFK_WARNING_MS = String(WARN_LEAD_MS);

let server: Server;
let wsUrl: string;

beforeAll(async () => {
  ({ server, wsUrl } = await startTestServer());
});

afterAll(async () => {
  await closeServer(server);
  delete process.env.AFK_TIMEOUT_MS;
  delete process.env.AFK_WARNING_MS;
});

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Start a game and report which socket belongs to the player on turn. */
async function startedGame() {
  const { ws: host, roomCode, playerId: hostId } = await createRoom(wsUrl, 'Host');
  const { ws: joiner, playerId: joinerId } = await joinRoom(wsUrl, roomCode, 'Joiner');

  const hostStart = waitForMessage(host, 'game_start') as Promise<Extract<ServerMessage, { type: 'game_start' }>>;
  const joinerStart = waitForMessage(joiner, 'game_start');
  send(host, { type: 'start_game' });
  const started = await hostStart;
  await joinerStart;

  const state = started.gameState;
  const onTurnId = state.players[state.currentPlayerIndex].id;
  const onTurn = onTurnId === hostId ? host : joiner;
  const waiting = onTurnId === hostId ? joiner : host;
  const onTurnName = onTurnId === hostId ? 'host' : 'joiner';

  return { host, joiner, roomCode, hostId, joinerId, onTurn, waiting, onTurnId, onTurnName };
}

async function sawMessage(ws: WebSocket, type: string, windowMs: number): Promise<boolean> {
  let seen = false;
  const handler = (raw: WebSocket.RawData) => {
    if ((JSON.parse(raw.toString()) as ServerMessage).type === type) seen = true;
  };
  ws.on('message', handler);
  await sleep(windowMs);
  ws.off('message', handler);
  return seen;
}

describe('in-game AFK warning', () => {
  it('warns the player whose turn it is, and only them', async () => {
    const { onTurn, waiting, onTurnName, host, joiner } = await startedGame();

    const [warnedOnTurn, warnedWaiting] = await Promise.all([
      sawMessage(onTurn, 'afk_warning', WARN_LEAD_MS + 400),
      sawMessage(waiting, 'afk_warning', WARN_LEAD_MS + 400),
    ]);

    expect(warnedOnTurn, `the ${onTurnName} is on turn and must be warned`).toBe(true);
    expect(warnedWaiting, 'the player who is NOT on turn must never be warned').toBe(false);

    host.close(); joiner.close();
  });

  it('addresses the warning to the player on the clock', async () => {
    // Without this the client cannot tell a warning meant for the opponent
    // from one meant for itself, which is what a wrong-phone popup looks like.
    const { onTurn, onTurnId, host, joiner } = await startedGame();

    const warn = await waitForMessage(onTurn, 'afk_warning') as Extract<ServerMessage, { type: 'afk_warning' }>;
    expect(warn.playerId).toBe(onTurnId);

    host.close(); joiner.close();
  });

  it('forfeits the player on turn, handing the win to the one waiting', async () => {
    const { onTurn, waiting, onTurnId, host, joiner } = await startedGame();

    const over = waitForMessage(waiting, 'game_update', 8000) as Promise<Extract<ServerMessage, { type: 'game_update' }>>;
    const msg = await over;

    expect(msg.gameState.phase).toBe('gameOver');
    expect(msg.gameState.endReason).toBe('forfeit');
    // The forfeiting side scores zero; the one who waited takes the points.
    expect(msg.gameState.players.find(p => p.id === onTurnId)?.score).toBe(0);

    onTurn.close(); host.close(); joiner.close();
  });

  it('still_here from the player on turn buys a fresh window', async () => {
    const { onTurn, waiting, host, joiner } = await startedGame();

    await waitForMessage(onTurn, 'afk_warning');
    send(onTurn, { type: 'still_here' });

    // The original deadline passes with the game still running.
    const died = await sawMessage(waiting, 'game_update', AFK_MS);
    expect(died, 'the match must not end after saying I am here').toBe(false);

    host.close(); joiner.close();
  });

  it('still_here from the player NOT on turn changes nothing', async () => {
    const { waiting, onTurnId, host, joiner } = await startedGame();

    send(waiting, { type: 'still_here' });

    // The player on turn still forfeits on schedule.
    const over = waitForMessage(waiting, 'game_update', 8000) as Promise<Extract<ServerMessage, { type: 'game_update' }>>;
    const msg = await over;
    expect(msg.gameState.phase).toBe('gameOver');
    expect(msg.gameState.players.find(p => p.id === onTurnId)?.score).toBe(0);

    host.close(); joiner.close();
  });
});
