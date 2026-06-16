/**
 * Achievement catalog. PURE DATA. No engine imports, no gameplay effects.
 *
 * `xp` accumulates into a cosmetic rank/title that has zero in-match impact.
 * See tests/unit/achievements.test.ts for the no-P2W invariants.
 */
export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string; // MaterialCommunityIcons name
  xp: number;  // cosmetic only
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first_win',
    title: 'First Win',
    description: 'Win your first game.',
    icon: 'trophy-outline',
    xp: 10,
  },
  {
    id: 'first_online_win',
    title: 'Online Debut',
    description: 'Win your first online game.',
    icon: 'earth',
    xp: 15,
  },
  {
    id: 'centurion',
    title: 'Centurion',
    description: 'Win a game scoring 100 or more points.',
    icon: 'medal-outline',
    xp: 25,
  },
  {
    id: 'landslide',
    title: 'Landslide',
    description: 'Win a game by 60 or more points.',
    icon: 'chart-line',
    xp: 25,
  },
  {
    id: 'hat_trick',
    title: 'Hat Trick',
    description: 'Win three games in a row.',
    icon: 'fire',
    xp: 30,
  },
] as const;

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievementXp(ids: Iterable<string>): number {
  let total = 0;
  for (const id of ids) {
    const def = ACHIEVEMENT_BY_ID.get(id);
    if (def) total += def.xp;
  }
  return total;
}
