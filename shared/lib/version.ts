/**
 * Semver comparison for the minimum-app-version gate.
 *
 * Kept dependency-free and free of any Expo import on purpose: the server
 * imports this too, and `shared/lib/app-version.ts` (which reads
 * `expo-constants`) must never reach the Node bundle.
 *
 * Anything unparseable becomes 0.0.0 — below every real floor. That is the
 * case that matters most: the builds already in the store send no version at
 * all, so "unknown" has to mean "oldest", never "newest".
 */

function parse(version: unknown): number[] {
  if (typeof version !== 'string') return [0, 0, 0];
  // Drop a pre-release/build suffix (1.2.0-beta.1, 1.2.0+build.5) before
  // splitting — see the test for why those count as the plain release.
  const core = version.trim().split(/[-+]/)[0];
  const parts = core.split('.').map((segment) => {
    const n = Number.parseInt(segment, 10);
    return Number.isNaN(n) || n < 0 ? 0 : n;
  });
  return parts.length ? parts : [0, 0, 0];
}

/** -1 if `a` is older than `b`, 1 if newer, 0 if the same release. */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 {
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}
