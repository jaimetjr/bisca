// One loaded full-screen ad per format, kept OUTSIDE React.
//
// The hooks used to hold their ad in a useRef, so every screen mount requested
// a fresh ad and every unmount threw the loaded one away. AdMob showed the
// cost: 12% show rate on the interstitial, 2.5% on the rewarded. A slot lives
// for the whole app session, so a loaded ad waits until someone actually shows
// it — however many times the home and game screens remount in between.
//
// Pure module (no React, no SDK import): the SDK pieces come in through
// AdSlotOptions, which keeps this testable under Node.

/** The slice of an InterstitialAd / RewardedAd this module touches. */
export interface AdLike {
  addAdEventListener(type: string, listener: (payload?: unknown) => void): () => void;
  load(): void;
  show(): Promise<void>;
}

export interface AdSlotOptions {
  /** Builds a new ad request. Called once per load attempt. */
  create: () => AdLike;
  /** Event names differ per format (rewarded has its own LOADED). */
  events: { loaded: string; closed: string; error: string; earned?: string };
  /** Resolves once consent is settled and the SDK is initialised; false = never load. */
  ready: Promise<boolean>;
  onLoadError?: (error: unknown) => void;
  /** Retries exhausted: the slot stops until the next show()/ensureLoaded() nudge. */
  onGiveUp?: (error: unknown) => void;
  now?: () => number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
  maxAgeMs?: number;
}

export interface AdSlot {
  /** Start loading if nothing usable is loaded or loading. Safe to call on every mount. */
  ensureLoaded(): void;
  /** True when an unexpired ad is ready to show. */
  isLoaded(): boolean;
  /**
   * Presents the loaded ad (resolves once it is on screen, not when it
   * closes — same as the SDK's show()). Resolves false without
   * showing when nothing is ready — and kicks a load so the next call has one.
   * `onEarned` fires only on a full rewarded view.
   */
  show(onEarned?: () => void): Promise<boolean>;
  /** Called with the new isLoaded() value whenever it may have changed. */
  subscribe(listener: (loaded: boolean) => void): () => void;
}

/** Max consecutive failed loads to retry before giving up until the next nudge. */
export const MAX_LOAD_RETRIES = 3;
/** Base backoff between retries; doubled each attempt (4s → 8s → 16s). */
export const BASE_RETRY_DELAY_MS = 4000;
/** Google expires a loaded full-screen ad after one hour; stay safely under it. */
export const MAX_AD_AGE_MS = 55 * 60 * 1000;

export function createAdSlot(options: AdSlotOptions): AdSlot {
  const {
    create,
    events,
    ready,
    onLoadError,
    onGiveUp,
    now = Date.now,
    maxRetries = MAX_LOAD_RETRIES,
    baseRetryDelayMs = BASE_RETRY_DELAY_MS,
    maxAgeMs = MAX_AD_AGE_MS,
  } = options;

  let ad: AdLike | null = null;
  let unlisten: (() => void)[] = [];
  let loaded = false;
  let loadedAt = 0;
  let loading = false;
  // A consumed ad stays attached until CLOSED, so its EARNED event still lands.
  let showing = false;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  // undefined = consent not settled yet; the first ensureLoaded() waits for it.
  let canLoad: boolean | undefined;
  let waitingForReady = false;
  let earnedCallback: (() => void) | undefined;
  const listeners = new Set<(loaded: boolean) => void>();

  const fresh = () => loaded && now() - loadedAt < maxAgeMs;
  const notify = () => {
    const value = fresh();
    listeners.forEach((l) => l(value));
  };

  function drop() {
    unlisten.forEach((u) => u());
    unlisten = [];
    ad = null;
    loaded = false;
    loading = false;
    showing = false;
  }

  function request() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    drop();
    loading = true;
    const next = create();
    ad = next;
    // Listeners check `ad === next` so a late event from a dropped ad can't
    // clobber the state of its replacement.
    unlisten.push(
      next.addAdEventListener(events.loaded, () => {
        if (ad !== next) return;
        loading = false;
        loaded = true;
        loadedAt = now();
        retryCount = 0;
        notify();
      }),
      next.addAdEventListener(events.closed, () => {
        if (ad !== next) return;
        drop();
        notify();
        request(); // preload the next one straight away
      }),
      next.addAdEventListener(events.error, (error) => {
        if (ad !== next) return;
        drop();
        notify();
        onLoadError?.(error);
        // Bounded retry with exponential backoff: a transient failure (no fill,
        // flaky network) recovers on its own, but a persistent error never
        // turns into an infinite request loop.
        if (retryCount >= maxRetries) {
          onGiveUp?.(error);
          return;
        }
        const delay = baseRetryDelayMs * 2 ** retryCount;
        retryCount += 1;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          request();
        }, delay);
      }),
    );
    if (events.earned) {
      unlisten.push(
        next.addAdEventListener(events.earned, () => {
          if (ad !== next) return;
          try {
            earnedCallback?.();
          } catch (err) {
            console.warn('[ads] onEarned threw:', err);
          }
        }),
      );
    }
    next.load();
  }

  function ensureLoaded() {
    if (canLoad === false) return;
    if (canLoad === undefined) {
      if (waitingForReady) return;
      waitingForReady = true;
      ready.then(
        (ok) => {
          canLoad = ok;
          if (ok) ensureLoaded();
        },
        () => {
          canLoad = false;
        },
      );
      return;
    }
    if (loading || showing || retryTimer || fresh()) return;
    request();
  }

  async function show(onEarned?: () => void): Promise<boolean> {
    if (showing) return false;
    if (!ad || !fresh()) {
      // Covers "retries exhausted" and "expired": start over so there is
      // something to show next time.
      if (!loading && !retryTimer) retryCount = 0;
      ensureLoaded();
      return false;
    }
    const current = ad;
    earnedCallback = onEarned;
    // An ad can only be shown once: it is consumed from here on.
    loaded = false;
    showing = true;
    notify();
    try {
      await current.show();
      return true;
    } catch {
      if (ad === current) {
        drop();
        request();
      }
      return false;
    }
  }

  return {
    ensureLoaded,
    isLoaded: fresh,
    show,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
