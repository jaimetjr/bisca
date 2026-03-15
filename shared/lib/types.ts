export type Suit = 'oros' | 'copas' | 'espadas' | 'bastos';
export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  capturedCards: Card[];
  score: number;
  isAI: boolean;
  difficulty?: AIDifficulty;
  team?: number;
}

export interface TrickCard {
  playerId: string;
  card: Card;
}

export interface GameState {
  players: Player[];
  deck: Card[];
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  currentTrick: TrickCard[];
  currentPlayerIndex: number;
  leadPlayerIndex: number;
  phase: 'waiting' | 'playing' | 'trickComplete' | 'gameOver';
  trickWinnerId: string | null;
  lastTrick: TrickCard[] | null;
}

export interface OnlineRoom {
  id: string;
  hostName: string;
  maxPlayers: number;
  players: { id: string; name: string }[];
  gameState: GameState | null;
  status: 'waiting' | 'playing' | 'finished';
}

export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
export const SUITS: Suit[] = ['oros', 'copas', 'espadas', 'bastos'];

export const CARD_POINTS: Record<number, number> = {
  1: 11,
  3: 10,
  12: 4,
  11: 3,
  10: 2,
  2: 0,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
};

export const CARD_STRENGTH: Record<number, number> = {
  1: 12,
  3: 11,
  12: 10,
  11: 9,
  10: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  2: 3,
};

export const SUIT_NAMES: Record<Suit, string> = {
  oros: 'Oros',
  copas: 'Copas',
  espadas: 'Espadas',
  bastos: 'Bastos',
};

export const RANK_NAMES: Record<number, string> = {
  1: 'As',
  2: 'Dos',
  3: 'Tres',
  4: 'Cuatro',
  5: 'Cinco',
  6: 'Seis',
  7: 'Siete',
  10: 'Sota',
  11: 'Caballo',
  12: 'Rey',
};
