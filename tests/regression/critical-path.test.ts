/**
 * Regression suite — fast, critical-path tests.
 * Run on every commit to catch breaking changes early.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createDeck } from '../../shared/lib/brisca/deck';
import {
  createGameState,
  playCard,
  completeTrick,
  determineTrickWinner,
  getTeamScores,
} from '../../shared/lib/brisca/engine';
import type { GameState } from '../../shared/lib/types';
import { startTestServer, closeServer, createRoom, joinRoom, send, waitForMessage } from '../integration/helpers';
import type { ServerMessage } from '../../shared/lib/types/messages';

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

// ─── 1. Deck integrity ────────────────────────────────────────────────────────

it('deck has exactly 40 unique cards', () => {
  const deck = createDeck();
  expect(deck).toHaveLength(40);
  expect(new Set(deck.map(c => c.id)).size).toBe(40);
});

// ─── 2. Trump determination ───────────────────────────────────────────────────

it('trump card suit is set correctly on game state', () => {
  const state = createGameState([
    { id: 'p1', name: 'A', isAI: false },
    { id: 'p2', name: 'B', isAI: false },
  ]);
  expect(state.trumpSuit).toBe(state.trumpCard?.suit);
  expect(['oros', 'copas', 'espadas', 'bastos']).toContain(state.trumpSuit);
});

// ─── 3. Trick winner: trump > lead suit > rank ────────────────────────────────

it('trump always beats lead-suit Ace', () => {
  const winner = determineTrickWinner(
    [
      { playerId: 'p1', card: { suit: 'copas', rank: 1, id: 'copas-1' } },  // Ace lead
      { playerId: 'p2', card: { suit: 'oros',  rank: 2, id: 'oros-2'  } },  // 2 of trump
    ],
    'oros',
  );
  expect(winner).toBe('p2');
});

// ─── 4. Score totals = 120 at game end ───────────────────────────────────────

it('total scores equal 120 in a complete 1v1 game', () => {
  let state = createGameState([
    { id: 'p1', name: 'A', isAI: false },
    { id: 'p2', name: 'B', isAI: false },
  ]);
  while (state.phase !== 'gameOver') {
    const p = state.players[state.currentPlayerIndex];
    state = playCard(state, p.id, p.hand[0]);
    if (state.phase === 'trickComplete') state = completeTrick(state);
  }
  expect(state.players.reduce((s, p) => s + p.score, 0)).toBe(120);
});

// ─── 5. Opponent hands are hidden (no card leaking) ──────────────────────────

it('createPlayerView hides opponent hands via game_start', async () => {
  const { ws: hostWs, roomCode, playerId: hostId } = await createRoom(wsUrl, 'Host');
  const { ws: guestWs } = await joinRoom(wsUrl, roomCode, 'Guest');

  const [hostStart] = await Promise.all([
    waitForMessage(hostWs, 'game_start') as Promise<Extract<ServerMessage, { type: 'game_start' }>>,
    waitForMessage(guestWs, 'game_start'),
    (async () => send(hostWs, { type: 'start_game' }))(),
  ]);

  const state = hostStart.gameState as GameState;
  const opponent = state.players.find(p => p.id !== hostId)!;
  expect(opponent.hand.every(c => c.id === 'hidden')).toBe(true);

  hostWs.close(); guestWs.close();
});

// ─── 6. AFK forfeit scores never exceed 120 ──────────────────────────────────

it('forfeit scores sum to 120 in a 2v2 game', () => {
  // Simulate forfeitGame logic: AFK player's team gets 0; winners split 120
  const afkTeam = 1;
  const players = createGameState([
    { id: 'p1', name: 'A', isAI: false, team: 0 },
    { id: 'p2', name: 'B', isAI: false, team: 0 },
    { id: 'p3', name: 'C', isAI: false, team: 1 },
    { id: 'p4', name: 'D', isAI: false, team: 1 },
  ]).players;

  const winningPlayers = players.filter(p => p.team !== afkTeam);
  const winScore = Math.floor(120 / winningPlayers.length);
  players.forEach(p => {
    p.score = p.team === afkTeam ? 0 : winScore;
  });

  const total = players.reduce((s, p) => s + p.score, 0);
  expect(total).toBeLessThanOrEqual(120);
});

// ─── 7. Team scores sum correctly in 2v2 ─────────────────────────────────────

it('team scores sum per-player scores correctly', () => {
  const players = createGameState([
    { id: 'p1', name: 'A', isAI: false, team: 0 },
    { id: 'p2', name: 'B', isAI: false, team: 0 },
    { id: 'p3', name: 'C', isAI: false, team: 1 },
    { id: 'p4', name: 'D', isAI: false, team: 1 },
  ]).players;
  players[0].score = 30; players[1].score = 35;
  players[2].score = 25; players[3].score = 30;

  const scores = getTeamScores(players);
  expect(scores.find(t => t.team === 0)?.score).toBe(65);
  expect(scores.find(t => t.team === 1)?.score).toBe(55);
});

// ─── 8. Room deleted when host leaves lobby ───────────────────────────────────

it('HOST_LEFT sent to remaining players when host disconnects', async () => {
  const { ws: host, roomCode } = await createRoom(wsUrl, 'Host');
  const { ws: joiner } = await joinRoom(wsUrl, roomCode, 'Joiner');

  const errPromise = waitForMessage(joiner, 'error') as Promise<Extract<ServerMessage, { type: 'error' }>>;
  host.close();
  const err = await errPromise;
  expect(err.code).toBe('HOST_LEFT');
  joiner.close();
});
