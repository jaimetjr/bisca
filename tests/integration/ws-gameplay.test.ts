import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import {
  startTestServer, closeServer,
  openWS, createRoom, joinRoom,
  send, waitForMessage,
} from './helpers';
import type { ServerMessage } from '../../shared/lib/types/messages';
import type { GameState } from '../../shared/lib/types';
import { TRICK_DISPLAY_MS } from '../../shared/constants/game';

vi.mock('../../server/db', () => ({ db: {} }));

let server: Server;
let wsUrl: string;

beforeAll(async () => {
  ({ server, wsUrl } = await startTestServer());
});

afterAll(async () => {
  await closeServer(server);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function startTwoPlayerGame() {
  const { ws: hostWs, roomCode, playerId: hostId } = await createRoom(wsUrl, 'Alice', 2);
  const { ws: guestWs, playerId: guestId } = await joinRoom(wsUrl, roomCode, 'Bob');

  const [hostStart, guestStart] = await Promise.all([
    waitForMessage(hostWs, 'game_start') as Promise<Extract<ServerMessage, { type: 'game_start' }>>,
    waitForMessage(guestWs, 'game_start') as Promise<Extract<ServerMessage, { type: 'game_start' }>>,
    (async () => send(hostWs, { type: 'start_game' }))(),
  ]);

  return { hostWs, guestWs, hostId, guestId, hostStart, guestStart };
}

// ─── start_game validation ────────────────────────────────────────────────────

describe('start_game', () => {
  it('returns NOT_HOST when a non-host tries to start', async () => {
    const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
    const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

    const errPromise = waitForMessage(joiner, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(joiner, { type: 'start_game' });
    const err = await errPromise;
    expect(err.code).toBe('NOT_HOST');
    host.close(); joiner.close();
  });

  it('returns NEED_MORE_PLAYERS when only the host is in the room', async () => {
    const { ws } = await createRoom(wsUrl, 'Lonely');
    const errPromise = waitForMessage(ws, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(ws, { type: 'start_game' });
    const err = await errPromise;
    expect(err.code).toBe('NEED_MORE_PLAYERS');
    ws.close();
  });

  it('all players receive game_start with their own playerId', async () => {
    const { hostWs, guestWs, hostId, guestId, hostStart, guestStart } = await startTwoPlayerGame();
    expect(hostStart.playerId).toBe(hostId);
    expect(guestStart.playerId).toBe(guestId);
    hostWs.close(); guestWs.close();
  });

  it('opponent hands are hidden in game_start state', async () => {
    const { hostWs, guestWs, hostId, hostStart } = await startTwoPlayerGame();
    const state = hostStart.gameState as GameState;
    const opponent = state.players.find(p => p.id !== hostId)!;
    for (const card of opponent.hand) {
      expect(card.id).toBe('hidden');
    }
    hostWs.close(); guestWs.close();
  });

  it('host can see their own real cards', async () => {
    const { hostWs, guestWs, hostId, hostStart } = await startTwoPlayerGame();
    const state = hostStart.gameState as GameState;
    const hostPlayer = state.players.find(p => p.id === hostId)!;
    expect(hostPlayer.hand.every(c => c.id !== 'hidden')).toBe(true);
    hostWs.close(); guestWs.close();
  });
});

// ─── play_card validation ─────────────────────────────────────────────────────

describe('play_card', () => {
  it('returns NOT_YOUR_TURN when the wrong player plays', async () => {
    const { hostWs, guestWs, guestId, guestStart } = await startTwoPlayerGame();

    // Current player is index 0 (host). Guest tries to play.
    const state = guestStart.gameState as GameState;
    const guestPlayer = state.players.find(p => p.id === guestId)!;

    const errPromise = waitForMessage(guestWs, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(guestWs, { type: 'play_card', cardId: guestPlayer.hand[0].id });
    const err = await errPromise;
    expect(err.code).toBe('NOT_YOUR_TURN');
    hostWs.close(); guestWs.close();
  });

  it('returns INVALID_CARD for a made-up card id', async () => {
    const { hostWs, guestWs } = await startTwoPlayerGame();
    const errPromise = waitForMessage(hostWs, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
    send(hostWs, { type: 'play_card', cardId: 'fake-card-id' });
    const err = await errPromise;
    expect(err.code).toBe('INVALID_CARD');
    hostWs.close(); guestWs.close();
  });

  it('valid play broadcasts game_update to all players', async () => {
    const { hostWs, guestWs, hostId, hostStart } = await startTwoPlayerGame();
    const state = hostStart.gameState as GameState;
    const hostPlayer = state.players.find(p => p.id === hostId)!;

    const [hostUpdate, guestUpdate] = await Promise.all([
      waitForMessage(hostWs, 'game_update'),
      waitForMessage(guestWs, 'game_update'),
      (async () => send(hostWs, { type: 'play_card', cardId: hostPlayer.hand[0].id }))(),
    ]);
    expect(hostUpdate.type).toBe('game_update');
    expect(guestUpdate.type).toBe('game_update');
    hostWs.close(); guestWs.close();
  });
});

// ─── Full game simulation ─────────────────────────────────────────────────────

describe('full 1v1 game', () => {
  it('ends with gameOver phase and total score of 120', async () => {
    const { hostWs, guestWs, hostId, guestId, hostStart, guestStart } = await startTwoPlayerGame();

    // Track each player's own view so we can always read their real hand cards
    const playerStates: Record<string, GameState> = {
      [hostId]: hostStart.gameState as GameState,
      [guestId]: guestStart.gameState as GameState,
    };

    const wsMap: Record<string, typeof hostWs> = {
      [hostId]: hostWs,
      [guestId]: guestWs,
    };

    while (playerStates[hostId].phase !== 'gameOver') {
      const currentPlayerId = playerStates[hostId].players[
        playerStates[hostId].currentPlayerIndex
      ].id;

      // Use the current player's own state to get their real (non-hidden) hand
      const currentPlayerState = playerStates[currentPlayerId].players.find(
        p => p.id === currentPlayerId,
      )!;
      const cardToPlay = currentPlayerState.hand[0];

      // Both players receive the update; collect both to keep playerStates in sync
      const [hostUpdate, guestUpdate] = await Promise.all([
        waitForMessage(hostWs, 'game_update') as Promise<Extract<ServerMessage, { type: 'game_update' }>>,
        waitForMessage(guestWs, 'game_update') as Promise<Extract<ServerMessage, { type: 'game_update' }>>,
        (async () => send(wsMap[currentPlayerId], { type: 'play_card', cardId: cardToPlay.id }))(),
      ]);

      playerStates[hostId] = hostUpdate.gameState as GameState;
      playerStates[guestId] = guestUpdate.gameState as GameState;

      // After trickComplete the server sends another game_update after TRICK_DISPLAY_MS
      if (playerStates[hostId].phase === 'trickComplete') {
        const [hostAfter, guestAfter] = await Promise.all([
          waitForMessage(hostWs, 'game_update', TRICK_DISPLAY_MS + 2000) as Promise<Extract<ServerMessage, { type: 'game_update' }>>,
          waitForMessage(guestWs, 'game_update', TRICK_DISPLAY_MS + 2000) as Promise<Extract<ServerMessage, { type: 'game_update' }>>,
        ]);
        playerStates[hostId] = hostAfter.gameState as GameState;
        playerStates[guestId] = guestAfter.gameState as GameState;
      }
    }

    const finalState = playerStates[hostId];
    const total = finalState.players.reduce((s, p) => s + p.score, 0);
    expect(total).toBe(120);
    expect(finalState.phase).toBe('gameOver');
    hostWs.close(); guestWs.close();
  }, 60_000); // Full game can take a while with real timers
});
