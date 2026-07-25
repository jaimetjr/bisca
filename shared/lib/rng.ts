/**
 * Seeded pseudo-random generator (mulberry32).
 *
 * The AI search draws many random samples per move; tests need those draws to
 * be reproducible so a failure is a real regression rather than an unlucky
 * shuffle. Production code keeps using `Math.random` — this only exists so a
 * deterministic generator can be injected.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates using an injected generator. Returns a new array. */
export function shuffleWith<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
