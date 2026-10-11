import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportAdGiveUp } from '@shared/lib/ad-monitoring';

// The real SDK pulls in react-native, which cannot load under node. Sentry is
// the external boundary here: whether an event is sent IS the behavior.
const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/react-native', () => ({ captureMessage, addBreadcrumb: vi.fn() }));

describe('reportAdGiveUp', () => {
  beforeEach(() => {
    captureMessage.mockClear();
  });

  // No-fill means AdMob had no ad to sell — normal inventory, not a bug.
  // react-native-google-mobile-ads emits all three spellings.
  it.each([
    'googleMobileAds/no-fill',
    'googleMobileAds/error-code-no-fill',
    'googleMobileAds/mediation-no-fill',
  ])('sends no Sentry event for %s', (code) => {
    reportAdGiveUp('banner', { code, message: 'Ad unit has no ad to show' });

    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('sends a Sentry event for a configuration failure', () => {
    reportAdGiveUp('interstitial', {
      code: 'googleMobileAds/invalid-request',
      message: 'Invalid ad unit ID',
    });

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe(
      'ad failed to load: interstitial (googleMobileAds/invalid-request)',
    );
  });

  it('sends a Sentry event when the error has no code', () => {
    reportAdGiveUp('rewarded', new Error('native module crashed'));

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe('ad failed to load: rewarded (unknown)');
  });
});
