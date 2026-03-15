import { Card, GameState, Player, TrickCard, Suit, AIDifficulty, CARD_POINTS, CARD_STRENGTH } from '../types';
import { createDeck, shuffleDeck, dealCards } from './deck';
import { GAME_WIN_SCORE } from '../../constants/game';

export function createGameState(playerConfigs: { id: string; name: string; isAI: boolean; difficulty?: AIDifficulty; team?: number }[]): GameState {
  const deck = shuffleDeck(createDeck());
  const cardsPerPlayer = 3;
  let remaining = deck;
  const players: Player[] = [];

  for (const config of playerConfigs) {
    const { dealt, remaining: rest } = dealCards(remaining, cardsPerPlayer);
    remaining = rest;
    players.push({
      id: config.id,
      name: config.name,
      hand: dealt,
      capturedCards: [],
      score: 0,
      isAI: config.isAI,
      difficulty: config.difficulty,
      team: config.team,
    });
  }

  const trumpCard = remaining[remaining.length - 1];
  const deckWithoutTrump = remaining.slice(0, remaining.length - 1);

  return {
    players,
    deck: deckWithoutTrump,
    trumpCard,
    trumpSuit: trumpCard.suit,
    currentTrick: [],
    currentPlayerIndex: 0,
    leadPlayerIndex: 0,
    phase: 'playing',
    trickWinnerId: null,
    lastTrick: null,
  };
}

export function getCardPoints(card: Card): number {
  return CARD_POINTS[card.rank] || 0;
}

export function getCardStrength(card: Card): number {
  return CARD_STRENGTH[card.rank] || 0;
}

export function determineTrickWinner(trick: TrickCard[], trumpSuit: Suit | null): string {
  if (trick.length === 0) return '';

  const leadSuit = trick[0].card.suit;
  let winnerId = trick[0].playerId;
  let winnerCard = trick[0].card;

  for (let i = 1; i < trick.length; i++) {
    const current = trick[i];
    const currentIsTrump = current.card.suit === trumpSuit;
    const winnerIsTrump = winnerCard.suit === trumpSuit;

    if (currentIsTrump && !winnerIsTrump) {
      winnerId = current.playerId;
      winnerCard = current.card;
    } else if (currentIsTrump && winnerIsTrump) {
      if (getCardStrength(current.card) > getCardStrength(winnerCard)) {
        winnerId = current.playerId;
        winnerCard = current.card;
      }
    } else if (!currentIsTrump && !winnerIsTrump) {
      if (current.card.suit === leadSuit && winnerCard.suit === leadSuit) {
        if (getCardStrength(current.card) > getCardStrength(winnerCard)) {
          winnerId = current.playerId;
          winnerCard = current.card;
        }
      } else if (current.card.suit === leadSuit && winnerCard.suit !== leadSuit) {
        winnerId = current.playerId;
        winnerCard = current.card;
      }
    }
  }

  return winnerId;
}

export function playCard(state: GameState, playerId: string, card: Card): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const playerIndex = newState.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;

  const player = newState.players[playerIndex];
  const cardIndex = player.hand.findIndex(c => c.id === card.id);
  if (cardIndex === -1) return state;

  player.hand.splice(cardIndex, 1);
  newState.currentTrick.push({ playerId, card });

  if (newState.currentTrick.length === newState.players.length) {
    newState.phase = 'trickComplete';
    const winnerId = determineTrickWinner(newState.currentTrick, newState.trumpSuit);
    newState.trickWinnerId = winnerId;
  } else {
    newState.currentPlayerIndex = (playerIndex + 1) % newState.players.length;
  }

  return newState;
}

export function completeTrick(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  if (!newState.trickWinnerId) return state;

  const winnerIndex = newState.players.findIndex(p => p.id === newState.trickWinnerId);
  if (winnerIndex === -1) return state;

  const trickPoints = newState.currentTrick.reduce(
    (sum, tc) => sum + getCardPoints(tc.card), 0
  );
  const trickCards = newState.currentTrick.map(tc => tc.card);
  newState.players[winnerIndex].capturedCards.push(...trickCards);
  newState.players[winnerIndex].score += trickPoints;

  newState.lastTrick = [...newState.currentTrick];
  newState.currentTrick = [];

  const hasCards = newState.deck.length > 0 || newState.trumpCard !== null;
  if (hasCards) {
    const drawOrder: number[] = [];
    for (let i = 0; i < newState.players.length; i++) {
      drawOrder.push((winnerIndex + i) % newState.players.length);
    }

    for (const idx of drawOrder) {
      if (newState.deck.length > 0) {
        const drawnCard = newState.deck.shift()!;
        newState.players[idx].hand.push(drawnCard);
      } else if (newState.trumpCard) {
        newState.players[idx].hand.push(newState.trumpCard);
        newState.trumpCard = null;
      }
    }
  }

  const allHandsEmpty = newState.players.every(p => p.hand.length === 0);
  if (allHandsEmpty) {
    newState.phase = 'gameOver';
  } else {
    newState.phase = 'playing';
    newState.currentPlayerIndex = winnerIndex;
    newState.leadPlayerIndex = winnerIndex;
  }

  newState.trickWinnerId = null;
  return newState;
}

export function isTeamGame(players: Player[]): boolean {
  return players.some(p => p.team !== undefined);
}

export function getTeamScores(players: Player[]): { team: number; score: number; names: string[] }[] {
  const teams = new Map<number, { score: number; names: string[] }>();
  for (const p of players) {
    const t = p.team ?? 0;
    const existing = teams.get(t) || { score: 0, names: [] };
    existing.score += p.score;
    existing.names.push(p.name);
    teams.set(t, existing);
  }
  return Array.from(teams.entries())
    .map(([team, data]) => ({ team, ...data }))
    .sort((a, b) => b.score - a.score);
}

export function calculateScores(players: Player[]): { id: string; name: string; score: number }[] {
  return players.map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
  })).sort((a, b) => b.score - a.score);
}

export function getWinner(players: Player[]): Player | null {
  const scores = calculateScores(players);
  if (scores.length === 0) return null;
  if (scores[0].score >= GAME_WIN_SCORE) {
    return players.find(p => p.id === scores[0].id) || null;
  }
  if (scores[0].score === GAME_WIN_SCORE - 1) return null;
  return players.find(p => p.id === scores[0].id) || null;
}
