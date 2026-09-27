import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAdSlot, MAX_AD_AGE_MS, type AdLike } from '@shared/lib/ad-cache';

const EVENTS = { loaded: 'loaded', closed: 'closed', error: 'error', earned: 'earned' };

/** A fake ad that records its listeners so a test can fire SDK events by hand. */
class FakeAd implements AdLike {
  listeners = new Map<string, Set<(p?: unknown) => void>>();
  loadCalls = 0;
  showCalls = 0;
  addAdEventListener(type: string, listener: (p?: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)!.delete(listener);
  }
  load() { this.loadCalls += 1; }
  async show() { this.showCalls += 1; }
  fire(type: string, payload?: unknown) {
    [...(this.listeners.get(type) ?? [])].forEach((l) => l(payload));
  }
}

function setup(ready: Promise<boolean> = Promise.resolve(true)) {
  const ads: FakeAd[] = [];
  let clock = 1_000_000;
  const onGiveUp = vi.fn();
  const onLoadError = vi.fn();
  const slot = createAdSlot({
    create: () => { const ad = new FakeAd(); ads.push(ad); return ad; },
    events: EVENTS,
    ready,
    onGiveUp,
    onLoadError,
    now: () => clock,
  });
  return {
    slot, ads, onGiveUp, onLoadError,
    last: () => ads[ads.length - 1],
    advanceClock: (ms: number) => { clock += ms; },
  };
}

// Lets the `ready` promise's then() run.
const flush = () => new Promise<void>((r) => setImmediate(r));

describe('ad-cache slot', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('reuses one loaded ad across many mounts instead of requesting again', async () => {
    const { slot, ads, last } = setup();
    slot.ensureLoaded();
    await flush();
    last().fire('loaded');
    // Home → game → home → game: every mount calls ensureLoaded.
    slot.ensureLoaded();
    slot.ensureLoaded();
    slot.ensureLoaded();
    expect(ads).toHaveLength(1);
    expect(slot.isLoaded()).toBe(true);
  });

  it('does not request twice while a load is in flight', async () => {
    const { slot, ads } = setup();
    slot.ensureLoaded();
    slot.ensureLoaded();
    await flush();
    slot.ensureLoaded();
    expect(ads).toHaveLength(1);
  });

  it('loads nothing until consent settles, and nothing if ads are not allowed', async () => {
    let settle!: (v: boolean) => void;
    const { slot, ads } = setup(new Promise((r) => { settle = r; }));
    slot.ensureLoaded();
    await flush();
    expect(ads).toHaveLength(0);
    settle(false);
    await flush();
    slot.ensureLoaded();
    await flush();
    expect(ads).toHaveLength(0);
    expect(await slot.show()).toBe(false);
  });

  it('starts loading once consent settles true', async () => {
    let settle!: (v: boolean) => void;
    const { slot, ads } = setup(new Promise((r) => { settle = r; }));
    slot.ensureLoaded();
    settle(true);
    await flush();
    expect(ads).toHaveLength(1);
    expect(ads[0].loadCalls).toBe(1);
  });

  it('shows the loaded ad once, then preloads the next on close', async () => {
    const { slot, ads, last } = setup();
    slot.ensureLoaded();
    await flush();
    last().fire('loaded');
    expect(await slot.show()).toBe(true);
    expect(ads[0].showCalls).toBe(1);
    expect(slot.isLoaded()).toBe(false);
    // A second show while the first is still on screen does nothing.
    expect(await slot.show()).toBe(false);
    ads[0].fire('closed');
    expect(ads).toHaveLength(2);
  });

  it('does not drop an ad that is on screen when a screen remounts', async () => {
    const { slot, ads, last } = setup();
    const earned = vi.fn();
    slot.ensureLoaded();
    await flush();
    last().fire('loaded');
    await slot.show(earned);
    slot.ensureLoaded(); // e.g. home screen remounting behind the ad
    expect(ads).toHaveLength(1);
    ads[0].fire('earned');
    expect(earned).toHaveBeenCalledTimes(1);
  });

  it('fires onEarned for the caller of show, only on a full view', async () => {
    const { slot, ads, last } = setup();
    const first = vi.fn();
    const second = vi.fn();
    slot.ensureLoaded();
    await flush();
    last().fire('loaded');
    await slot.show(first);
    ads[0].fire('closed'); // dismissed without earning
    expect(first).not.toHaveBeenCalled();
    ads[1].fire('loaded');
    await slot.show(second);
    ads[1].fire('earned');
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('treats an ad older than the expiry as not loaded and reloads it', async () => {
    const { slot, ads, last, advanceClock } = setup();
    slot.ensureLoaded();
    await flush();
    last().fire('loaded');
    advanceClock(MAX_AD_AGE_MS + 1);
    expect(slot.isLoaded()).toBe(false);
    expect(await slot.show()).toBe(false);
    expect(ads[0].showCalls).toBe(0);
    expect(ads).toHaveLength(2);
  });

  it('retries with backoff, gives up after 3 retries, and restarts on show', async () => {
    const { slot, ads, last, onGiveUp, onLoadError } = setup();
    slot.ensureLoaded();
    await flush();
    last().fire('error', { code: 'googleMobileAds/no-fill' });
    expect(ads).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(ads).toHaveLength(2);
    last().fire('error');
    vi.advanceTimersByTime(8000);
    expect(ads).toHaveLength(3);
    last().fire('error');
    vi.advanceTimersByTime(16000);
    expect(ads).toHaveLength(4);
    last().fire('error');
    vi.advanceTimersByTime(60000);
    expect(ads).toHaveLength(4);
    expect(onLoadError).toHaveBeenCalledTimes(4);
    expect(onGiveUp).toHaveBeenCalledTimes(1);

    // The old interstitial stayed dead here for the rest of the screen's life.
    expect(await slot.show()).toBe(false);
    expect(ads).toHaveLength(5);
    last().fire('loaded');
    expect(await slot.show()).toBe(true);
  });

  it('ignores late events from an ad it already dropped', async () => {
    const { slot, ads, last } = setup();
    slot.ensureLoaded();
    await flush();
    const stale = last();
    stale.fire('error');
    vi.advanceTimersByTime(4000);
    last().fire('loaded');
    stale.fire('error'); // listeners were removed; must not clobber the new ad
    expect(slot.isLoaded()).toBe(true);
    expect(ads).toHaveLength(2);
  });

  it('notifies subscribers when the loaded state changes', async () => {
    const { slot, last } = setup();
    const seen: boolean[] = [];
    const unsubscribe = slot.subscribe((v) => seen.push(v));
    slot.ensureLoaded();
    await flush();
    last().fire('loaded');
    await slot.show();
    unsubscribe();
    last().fire('closed');
    expect(seen).toEqual([true, false]);
  });
});
