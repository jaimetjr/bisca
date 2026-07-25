import { Card, GameState, AIDifficulty } from '../types';
import { chooseSearchCard, SearchOptions } from './ai-search';

export type { SearchOptions } from './ai-search';

/**
 * Pick the AI's card.
 *
 * Backed by the PIMC search in ./ai-search.ts. The signature is unchanged from
 * the old heuristic version — the fourth parameter is optional, so the single
 * production call site (app/game.tsx) needs no change.
 *
 * `strictFollowSuit` defaults to false because offline play does not enforce
 * suit-following: app/game.tsx calls `playCard` directly with no legality
 * check, so the human may legally play anything, and the search must model
 * them that way. Only the online server enforces the rule (game-rooms.ts),
 * and the AI never runs online. Flip the flag if that ever changes.
 */
export function chooseAICard(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty = 'medium',
  options: SearchOptions = {},
): Card | null {
  return chooseSearchCard(state, playerId, difficulty, options);
}
