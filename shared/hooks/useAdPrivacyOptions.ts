import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { AdsConsent } from 'react-native-google-mobile-ads';

/**
 * The "manage your ad consent" entry point UMP requires.
 *
 * Once a consent form has been shown, Google requires the app to offer a way
 * back into it — a player who accepted must be able to change their mind. The
 * SDK tells us whether that entry point is required for this player via
 * `privacyOptionsRequirementStatus`; outside a regulated region it is
 * NOT_REQUIRED and `available` stays false, so nobody sees a row that would
 * open an empty form.
 *
 * Re-checked on mount rather than cached in a module: the status only settles
 * after `gatherConsent()` has run at startup (app/_layout.tsx), and it changes
 * when a player travels.
 */
export function useAdPrivacyOptions(): { available: boolean; open: () => Promise<void> } {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      try {
        const { privacyOptionsRequirementStatus } = await AdsConsent.getConsentInfo();
        if (!cancelled) setAvailable(privacyOptionsRequirementStatus === 'REQUIRED');
      } catch {
        // Consent state unreadable — leave the row hidden rather than offering
        // a control that would throw when tapped.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = useCallback(async () => {
    try {
      await AdsConsent.showPrivacyOptionsForm();
    } catch {
      // Nothing useful to tell the player: the form failed to load, their
      // existing choice is unchanged, and tapping again is the whole remedy.
    }
  }, []);

  return { available, open };
}
