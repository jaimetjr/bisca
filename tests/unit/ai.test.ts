import { describe, it, expect } from 'vitest';
import { chooseAICard } from '../../shared/lib/brisca/ai';
import { createGameState, playCard } from '../../shared/lib/brisca/engine';
import type { GameState } from '../../shared/lib/types';

function freshState(): GameState {
  return createGameState([
    { id: 'ai', name: 'AI', isAI: true },
    { id: 'human', name: 'Human', isAI: false },
  ]);
}

// ─── Basic contract ───────────────────────────────────────────────────────────

describe('chooseAICard — basic contract', () => {
  it('returns null when player has no cards', () => {
    const state = freshState();
    // Fake a player with empty hand
    const modified = JSON.parse(JSON.stringify(state)) as GameState;
    modified.players[0].hand = [];
    expect(chooseAICard(modified, 'ai')).toBeNull();
  });

  it('returns the only card when hand has one card', () => {
    const state = freshState();
    const modified = JSON.parse(JSON.stringify(state)) as GameState;
    const only = modified.players[0].hand[0];
    modified.players[0].hand = [only];
    const chosen = chooseAICard(modified, 'ai');
    expect(chosen?.id).toBe(only.id);
  });

  it('always returns a card that exists in the player hand', () => {
    for (let i = 0; i < 20; i++) {
      const state = freshState();
      const handIds = new Set(state.players[0].hand.map(c => c.id));
      const chosen = chooseAICard(state, 'ai', 'medium');
      expect(chosen).not.toBeNull();
      expect(handIds.has(chosen!.id)).toBe(true);
    }
  });

  it('returns null for unknown playerId', () => {
    const state = freshState();
    expect(chooseAICard(state, 'nobody')).toBeNull();
  });
});

// ─── Easy difficulty ─────────────────────────────────────────────────────────

describe('chooseAICard — easy', () => {
  it('always picks a valid hand card', () => {
    for (let i = 0; i < 10; i++) {
      const state = freshState();
      const handIds = new Set(state.players[0].hand.map(c => c.id));
      const chosen = chooseAICard(state, 'ai', 'easy');
      expect(handIds.has(chosen!.id)).toBe(true);
    }
  });

  it('shows random variance across many runs (not always same card)', () => {
    // With 3+ cards and 30 runs, we expect more than 1 distinct card chosen
    const results = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const state = freshState();
      results.add(chooseAICard(state, 'ai', 'easy')!.id);
    }
    // It would be astronomically unlikely to always pick the same card
    expect(results.size).toBeGreaterThan(1);
  });
});

// ─── Medium difficulty ────────────────────────────────────────────────────────

describe('chooseAICard — medium', () => {
  it('always picks a valid hand card', () => {
    for (let i = 0; i < 10; i++) {
      const state = freshState();
      const handIds = new Set(state.players[0].hand.map(c => c.id));
      expect(handIds.has(chooseAICard(state, 'ai', 'medium')!.id)).toBe(true);
    }
  });

  it('responds when it is not leading (opponent has already played)', () => {
    let state = freshState();
    // Human plays first — put human at index 0 temporarily by swapping
    const swapped = JSON.parse(JSON.stringify(state)) as GameState;
    swapped.currentPlayerIndex = 1;
    swapped.players = [swapped.players[1], swapped.players[0]];
    // Play a card for human (now index 0 after swap)
    swapped.currentPlayerIndex = 0;
    const humanCard = swapped.players[0].hand[0];
    state = playCard(swapped, swapped.players[0].id, humanCard);

    // Now AI should respond
    const aiHandIds = new Set(state.players[1].hand.map(c => c.id));
    const chosen = chooseAICard(state, 'ai', 'medium');
    expect(chosen).not.toBeNull();
    expect(aiHandIds.has(chosen!.id)).toBe(true);
  });
});

// ─── Hard difficulty ──────────────────────────────────────────────────────────

describe('chooseAICard — hard', () => {
  it('always picks a valid hand card', () => {
    for (let i = 0; i < 10; i++) {
      const state = freshState();
      const handIds = new Set(state.players[0].hand.map(c => c.id));
      expect(handIds.has(chooseAICard(state, 'ai', 'hard')!.id)).toBe(true);
    }
  });
});
