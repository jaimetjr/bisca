import { describe, it, expect } from 'vitest';
import { nextReconnectDelay, MAX_RECONNECT_DELAY_MS } from '../../shared/lib/reconnect-backoff';

const GRACE = 120_000;
const T0 = 1_000_000;

describe('nextReconnectDelay', () => {
  it('backs off exponentially', () => {
    const mid = () => 0.5; // jitter factor lands exactly on 1.0
    expect(nextReconnectDelay(0, T0, GRACE, T0, mid)).toBe(1000);
    expect(nextReconnectDelay(1, T0, GRACE, T0, mid)).toBe(2000);
    expect(nextReconnectDelay(2, T0, GRACE, T0, mid)).toBe(4000);
  });

  it('caps the base delay', () => {
    const mid = () => 0.5;
    expect(nextReconnectDelay(20, T0, GRACE, T0, mid)).toBe(MAX_RECONNECT_DELAY_MS);
  });

  it('keeps jitter inside +/-20%', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const d = nextReconnectDelay(2, T0, GRACE, T0, () => r)!;
      expect(d).toBeGreaterThanOrEqual(4000 * 0.8);
      expect(d).toBeLessThanOrEqual(4000 * 1.2);
    }
  });

  it('gives up once the grace window has passed', () => {
    expect(nextReconnectDelay(0, T0, GRACE, T0 + GRACE)).toBeNull();
    expect(nextReconnectDelay(0, T0, GRACE, T0 + GRACE + 1)).toBeNull();
  });

  it('still retries one millisecond before the deadline', () => {
    expect(nextReconnectDelay(0, T0, GRACE, T0 + GRACE - 1)).not.toBeNull();
  });
});
