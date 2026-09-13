import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import type WebSocket from 'ws';
import {
  startTestServer, closeServer,
  openWS, createRoom, joinRoom, send, waitForMessage,
} from './helpers';
import type { ServerMessage } from '../../shared/lib/types/messages';

vi.mock('../../server/db', () => ({ db: {} }));

// Long enough that the AFK clock cannot be mistaken for a disconnect forfeit.
const AFK_MS = 4000;
process.env.AFK_TIMEOUT_MS = String(AFK_MS);
process.env.AFK_WARNING_MS = '1000';
// If a disconnect forfeit is ever reintroduced honouring this, these tests fail.
process.env.DISCONNECT_GRACE_MS = '300';

let server: Server;
let wsUrl: string;

beforeAll(async () => {
  ({ server, wsUrl } = await startTestServer());
});

afterAll(async () => {
  await closeServer(server);
  delete process.env.AFK_TIMEOUT_MS;
  delete process.env.AFK_WARNING_MS;
  delete process.env.DISCONNECT_GRACE_MS;
});

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function startedGame() {
  const { ws: host, roomCode, playerId: hostId, reconnectToken: hostToken } = await createRoom(wsUrl, 'Host');
  const { ws: joiner, playerId: joinerId, reconnectToken: joinerToken } = await joinRoom(wsUrl, roomCode, 'Joiner');

  const hostStart = waitForMessage(host, 'game_start') as Promise<Extract<ServerMessage, { type: 'game_start' }>>;
  const joinerStart = waitForMessage(joiner, 'game_start') as Promise<Extract<ServerMessage, { type: 'game_start' }>>;
  send(host, { type: 'start_game' });
  const started = await hostStart;
  const joinerView = await joinerStart;

  const state = started.gameState;
  const onTurnId = state.players[state.currentPlayerIndex].id;
  const hostOnTurn = onTurnId === hostId;

  return {
    host, joiner, roomCode, hostId, joinerId,
    onTurn: hostOnTurn ? host : joiner,
    waiting: hostOnTurn ? joiner : host,
    waitingId: hostOnTurn ? joinerId : hostId,
    waitingToken: hostOnTurn ? joinerToken : hostToken,
    onTurnId,
    // The on-turn player's own hand, from their own view (the other view hides it).
    onTurnHand: (hostOnTurn ? started.gameState : joinerView.gameState)
      .players.find(p => p.id === onTurnId)!.hand,
  };
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

describe('dropping out mid-match', () => {
  it('does not forfeit a player who drops when it is not their turn', async () => {
    // The reported bug: the host played, backgrounded the app, and lost ten
    // seconds later even though the game was not waiting on them at all.
    const { onTurn, waiting, host, joiner } = await startedGame();

    waiting.close();
    const died = await sawMessage(onTurn, 'game_update', 1500);

    expect(died, 'a dropped connection must not end the match by itself').toBe(false);

    host.close(); joiner.close();
  });

  it('tells the other player their opponent is away, and when they are back', async () => {
    const { onTurn, waiting, waitingId, waitingToken, host, joiner } = await startedGame();

    const goneP = waitForMessage(onTurn, 'presence') as Promise<Extract<ServerMessage, { type: 'presence' }>>;
    waiting.close();
    const gone = await goneP;
    expect(gone.playerId).toBe(waitingId);
    expect(gone.connected).toBe(false);

    const backP = waitForMessage(onTurn, 'presence') as Promise<Extract<ServerMessage, { type: 'presence' }>>;
    const revived = await openWS(wsUrl);
    send(revived, { type: 'reconnect', playerId: waitingId, reconnectToken: waitingToken });
    const back = await backP;
    expect(back.playerId).toBe(waitingId);
    expect(back.connected).toBe(true);

    revived.close(); host.close(); joiner.close();
  });

  it('can rejoin and keep playing the same match', async () => {
    const { onTurn, waiting, waitingId, waitingToken, host, joiner } = await startedGame();

    waiting.close();
    await sleep(800); // well past any old disconnect grace

    const revived = await openWS(wsUrl);
    const resumed = waitForMessage(revived, 'reconnected') as Promise<Extract<ServerMessage, { type: 'reconnected' }>>;
    send(revived, { type: 'reconnect', playerId: waitingId, reconnectToken: waitingToken });

    expect((await resumed).gameState.phase).toBe('playing');

    revived.close(); onTurn.close(); host.close(); joiner.close();
  });

  it('still forfeits once the turn reaches them and the AFK clock runs out', async () => {
    // Being away is only a loss when the game is actually waiting on you.
    const { onTurn, waiting, waitingId, onTurnHand, host, joiner } = await startedGame();

    waiting.close();
    // Hand the turn over to the player who is away: leading is always legal.
    send(onTurn, { type: 'play_card', cardId: onTurnHand[0].id });

    let msg = await waitForMessage(onTurn, 'game_update', 15000) as Extract<ServerMessage, { type: 'game_update' }>;
    while (msg.gameState.phase !== 'gameOver') {
      msg = await waitForMessage(onTurn, 'game_update', 15000) as Extract<ServerMessage, { type: 'game_update' }>;
    }

    expect(msg.gameState.phase).toBe('gameOver');
    expect(msg.gameState.endReason).toBe('forfeit');
    expect(msg.gameState.players.find(p => p.id === waitingId)?.score).toBe(0);

    host.close(); joiner.close();
  });
});
