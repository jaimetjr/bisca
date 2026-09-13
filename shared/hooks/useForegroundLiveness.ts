import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

/** Calls `onForeground` when the app returns to view. Must be idempotent. */
export function useForegroundLiveness(onForeground: () => void) {
  const cb = useRef(onForeground);
  cb.current = onForeground;

  useEffect(() => {
    const fire = () => cb.current();

    if (Platform.OS !== 'web') {
      let prev = AppState.currentState;
      const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
        if (/inactive|background/.test(prev) && next === 'active') fire();
        prev = next;
      });
      return () => sub.remove();
    }

    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const onVisible = () => { if (!document.hidden) fire(); };
    // iOS Safari restores from bfcache without firing visibilitychange.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) fire(); };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', fire);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', fire);
    };
  }, []);
}
