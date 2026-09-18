import { describe, it, expect } from 'vitest';
import { MIN_HEAP_MB_FOR_FULL_PRELOAD, shouldPreloadFullDeck } from '@shared/lib/device-memory';

describe('shouldPreloadFullDeck', () => {
  it('preloads the full deck on a generous heap', () => {
    expect(shouldPreloadFullDeck(256)).toBe(true);
  });

  it('skips the full deck on the 128MB heap class that crashed in production', () => {
    expect(shouldPreloadFullDeck(128)).toBe(false);
  });

  it('treats an unreadable heap size as the constrained case', () => {
    expect(shouldPreloadFullDeck(null)).toBe(false);
  });

  it('is inclusive at the threshold', () => {
    expect(shouldPreloadFullDeck(MIN_HEAP_MB_FOR_FULL_PRELOAD)).toBe(true);
    expect(shouldPreloadFullDeck(MIN_HEAP_MB_FOR_FULL_PRELOAD - 1)).toBe(false);
  });
});
