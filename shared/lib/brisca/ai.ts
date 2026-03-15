import { Card, GameState, TrickCard, Suit, AIDifficulty } from '../types';
import { AI_DIFFICULTY_CONFIG, AI_SAFE_DISCARD_MAX_POINTS } from '../../constants/game';
import { getCardStrength, getCardPoints, determineTrickWinner } from './engine';

function getPlayableCards(state: GameState, playerId: string): Card[] {
  const player = state.players.find(p => p.id === playerId);
  return player ? [...player.hand] : [];
}

function isWinningCard(
  card: Card,
  currentTrick: TrickCard[],
  trumpSuit: Suit | null,
): boolean {
  if (currentTrick.length === 0) return true;
  const testTrick: TrickCard[] = [...currentTrick, { playerId: 'test', card }];
  return determineTrickWinner(testTrick, trumpSuit) === 'test';
}

function getTrickPoints(trick: TrickCard[]): number {
  return trick.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);
}

function chooseRandom(cards: Card[]): Card {
  return cards[Math.floor(Math.random() * cards.length)];
}

function getPlayedHighValueCards(state: GameState): Set<string> {
  const played = new Set<string>();
  for (const player of state.players) {
    for (const card of player.capturedCards) {
      if (getCardPoints(card) >= 10) {
        played.add(`${card.suit}-${card.rank}`);
      }
    }
  }
  return played;
}

export function chooseAICard(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty = 'medium',
): Card | null {
  const cards = getPlayableCards(state, playerId);
  if (cards.length === 0) return null;
  if (cards.length === 1) return cards[0];

  // Easy: purely random
  if (difficulty === 'easy') return chooseRandom(cards);

  const config = AI_DIFFICULTY_CONFIG[difficulty];
  const { currentTrick, trumpSuit, players } = state;
  const isLeading = currentTrick.length === 0;
  const isLastPlayer = currentTrick.length === players.length - 1;
  const trickPoints = getTrickPoints(currentTrick);

  const trumpCards = cards.filter(c => c.suit === trumpSuit);
  const nonTrumpCards = cards.filter(c => c.suit !== trumpSuit);

  // Hard mode: track remaining high-value cards to inform risk
  const playedHighValue = config.trackPlayed ? getPlayedHighValueCards(state) : new Set<string>();
  const highValueStillOut = (suit: Suit) =>
    !playedHighValue.has(`${suit}-1`) || !playedHighValue.has(`${suit}-3`);

  if (isLeading) {
    // Prefer low-value non-trump first
    const lowValueNonTrumps = nonTrumpCards
      .filter(c => getCardPoints(c) === 0)
      .sort((a, b) => getCardStrength(a) - getCardStrength(b));
    if (lowValueNonTrumps.length > 0) return lowValueNonTrumps[0];

    // In hard mode, prefer leading non-trump suits where no high cards remain
    if (config.trackPlayed) {
      const safeLeads = nonTrumpCards.filter(c => !highValueStillOut(c.suit));
      if (safeLeads.length > 0) {
        return safeLeads.sort((a, b) => getCardPoints(a) - getCardPoints(b))[0];
      }
    }

    const lowValueTrumps = trumpCards
      .filter(c => getCardPoints(c) === 0)
      .sort((a, b) => getCardStrength(a) - getCardStrength(b));
    if (lowValueTrumps.length > 0) return lowValueTrumps[0];

    return cards.sort((a, b) => getCardPoints(a) - getCardPoints(b))[0];
  }

  const winningCards = cards.filter(c => isWinningCard(c, currentTrick, trumpSuit));
  const losingCards = cards.filter(c => !isWinningCard(c, currentTrick, trumpSuit));

  if (isLastPlayer) {
    if (trickPoints >= config.winThresholdLow && winningCards.length > 0) {
      const cheapestWinner = winningCards.sort((a, b) => {
        const aDiff = getCardPoints(a);
        const bDiff = getCardPoints(b);
        if (aDiff !== bDiff) return aDiff - bDiff;
        return getCardStrength(a) - getCardStrength(b);
      })[0];
      return cheapestWinner;
    }

    if (losingCards.length > 0) {
      return losingCards.sort((a, b) => getCardPoints(a) - getCardPoints(b))[0];
    }

    return winningCards.sort((a, b) => getCardPoints(a) - getCardPoints(b))[0];
  }

  if (trickPoints >= config.winThresholdHigh && winningCards.length > 0) {
    const nonTrumpWinners = winningCards.filter(c => c.suit !== trumpSuit);
    if (nonTrumpWinners.length > 0) {
      return nonTrumpWinners.sort((a, b) => getCardStrength(a) - getCardStrength(b))[0];
    }

    const cheapTrumpWinners = winningCards
      .filter(c => c.suit === trumpSuit && getCardPoints(c) <= AI_SAFE_DISCARD_MAX_POINTS);
    if (cheapTrumpWinners.length > 0) {
      return cheapTrumpWinners.sort((a, b) => getCardStrength(a) - getCardStrength(b))[0];
    }
  }

  if (losingCards.length > 0) {
    const cheapLosers = losingCards
      .filter(c => c.suit !== trumpSuit)
      .sort((a, b) => {
        const pointDiff = getCardPoints(a) - getCardPoints(b);
        if (pointDiff !== 0) return pointDiff;
        return getCardStrength(a) - getCardStrength(b);
      });
    if (cheapLosers.length > 0) return cheapLosers[0];
    return losingCards.sort((a, b) => getCardPoints(a) - getCardPoints(b))[0];
  }

  return winningCards.sort((a, b) => {
    const pointDiff = getCardPoints(a) - getCardPoints(b);
    if (pointDiff !== 0) return pointDiff;
    return getCardStrength(a) - getCardStrength(b);
  })[0];
}
