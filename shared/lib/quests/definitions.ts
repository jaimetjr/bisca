import { QuestDef } from './types';

/**
 * The daily quest catalog. Three are picked deterministically per UTC day.
 * All rewards are cosmetic XP — never gameplay buffs.
 */
export const QUESTS: readonly QuestDef[] = [
  {
    id: 'play_3',
    title: 'Warm-up',
    description: 'Play 3 games today.',
    icon: 'play-circle-outline',
    target: 3,
    xp: 10,
    evalDelta: () => 1,
  },
  {
    id: 'win_2',
    title: 'Daily Double',
    description: 'Win 2 games today.',
    icon: 'trophy-variant-outline',
    target: 2,
    xp: 15,
    evalDelta: (g) => (g.result === 'win' ? 1 : 0),
  },
  {
    id: 'score_80',
    title: 'Strong Hand',
    description: 'Score 80 or more in a single game today.',
    icon: 'cards',
    target: 1,
    xp: 15,
    evalDelta: (g) => (g.score >= 80 ? 1 : 0),
  },
  {
    id: 'online_1',
    title: 'Online Outing',
    description: 'Play 1 online game today.',
    icon: 'earth',
    target: 1,
    xp: 10,
    evalDelta: (g) => (g.mode === 'online' ? 1 : 0),
  },
  {
    id: 'centurion_today',
    title: 'Hundred Club',
    description: 'Score 100 or more in a single game today.',
    icon: 'medal-outline',
    target: 1,
    xp: 25,
    evalDelta: (g) => (g.score >= 100 ? 1 : 0),
  },
] as const;

export const QUEST_BY_ID = new Map(QUESTS.map((q) => [q.id, q]));
