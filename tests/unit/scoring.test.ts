import { describe, it, expect } from 'vitest';
import {
  calculateScores,
  getTeamScores,
  getWinner,
  isTeamGame,
} from '../../shared/lib/brisca/engine';
import type { Player } from '../../shared/lib/types';

function player(id: string, score: number, team?: number): Player {
  return {
    id,
    name: id,
    hand: [],
    capturedCards: [],
    score,
    isAI: false,
    team,
  };
}

// ─── calculateScores ─────────────────────────────────────────────────────────

describe('calculateScores', () => {
  it('returns scores sorted descending', () => {
    const players = [player('a', 40), player('b', 80)];
    const scores = calculateScores(players);
    expect(scores[0].score).toBeGreaterThanOrEqual(scores[1].score);
  });

  it('includes all players', () => {
    const players = [player('a', 10), player('b', 20), player('c', 30)];
    expect(calculateScores(players)).toHaveLength(3);
  });

  it('maps correct id and name', () => {
    const players = [player('alice', 61)];
    const [s] = calculateScores(players);
    expect(s.id).toBe('alice');
    expect(s.name).toBe('alice');
    expect(s.score).toBe(61);
  });

  it('handles equal scores without throwing', () => {
    const players = [player('a', 60), player('b', 60)];
    expect(() => calculateScores(players)).not.toThrow();
  });
});

// ─── getTeamScores ────────────────────────────────────────────────────────────

describe('getTeamScores', () => {
  it('sums scores for each team', () => {
    const players = [
      player('a', 30, 0),
      player('b', 31, 0),
      player('c', 25, 1),
      player('d', 34, 1),
    ];
    const teamScores = getTeamScores(players);
    const t0 = teamScores.find(t => t.team === 0)!;
    const t1 = teamScores.find(t => t.team === 1)!;
    expect(t0.score).toBe(61);
    expect(t1.score).toBe(59);
  });

  it('total team scores equal 120 in a complete game', () => {
    const players = [
      player('a', 30, 0), player('b', 31, 0),
      player('c', 25, 1), player('d', 34, 1),
    ];
    const total = getTeamScores(players).reduce((s, t) => s + t.score, 0);
    expect(total).toBe(120);
  });

  it('returns teams sorted by score descending', () => {
    const players = [player('a', 10, 0), player('b', 20, 1)];
    const scores = getTeamScores(players);
    expect(scores[0].score).toBeGreaterThanOrEqual(scores[1].score);
  });

  it('includes player names in each team', () => {
    const players = [player('Alice', 60, 0), player('Bob', 60, 1)];
    const scores = getTeamScores(players);
    expect(scores.find(t => t.team === 0)?.names).toContain('Alice');
  });

  it('draw: both teams have 60 points each', () => {
    const players = [
      player('a', 30, 0), player('b', 30, 0),
      player('c', 30, 1), player('d', 30, 1),
    ];
    const scores = getTeamScores(players);
    expect(scores[0].score).toBe(60);
    expect(scores[1].score).toBe(60);
  });
});

// ─── getWinner ────────────────────────────────────────────────────────────────

describe('getWinner', () => {
  it('returns the player with score >= 61', () => {
    const players = [player('a', 61), player('b', 59)];
    expect(getWinner(players)?.id).toBe('a');
  });

  it('returns null for a 60/60 draw', () => {
    const players = [player('a', 60), player('b', 60)];
    expect(getWinner(players)).toBeNull();
  });

  it('returns null for empty players', () => {
    expect(getWinner([])).toBeNull();
  });
});

// ─── isTeamGame ───────────────────────────────────────────────────────────────

describe('isTeamGame', () => {
  it('returns true when any player has a team', () => {
    const players = [player('a', 0, 0), player('b', 0, 1)];
    expect(isTeamGame(players)).toBe(true);
  });

  it('returns false when no player has a team', () => {
    const players = [player('a', 0), player('b', 0)];
    expect(isTeamGame(players)).toBe(false);
  });
});
