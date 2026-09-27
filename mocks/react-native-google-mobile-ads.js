// Stub for Expo Go — real ads only work in EAS builds.
// In production (EAS_BUILD=true), metro resolves the real package instead.

const noop = () => {};
const noopAsync = async () => {};

const TestIds = {
  BANNER: 'test-banner-id',
  INTERSTITIAL: 'test-interstitial-id',
  REWARDED: 'test-rewarded-id',
};

const BannerAdSize = {
  BANNER: 'BANNER',
  ADAPTIVE_BANNER: 'ADAPTIVE_BANNER',
  FULL_BANNER: 'FULL_BANNER',
  ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER',
  LARGE_ANCHORED_ADAPTIVE_BANNER: 'LARGE_ANCHORED_ADAPTIVE_BANNER',
  INLINE_ADAPTIVE_BANNER: 'INLINE_ADAPTIVE_BANNER',
};

const AdEventType = {
  LOADED: 'loaded',
  CLOSED: 'closed',
  ERROR: 'error',
  OPENED: 'opened',
  CLICKED: 'clicked',
};

const RewardedAdEventType = {
  LOADED: 'rewarded_loaded',
  EARNED_REWARD: 'rewarded_earned',
};

const InterstitialAd = {
  createForAdRequest: () => ({
    addAdEventListener: () => noop,
    load: noop,
    show: noopAsync,
  }),
};

const RewardedAd = {
  createForAdRequest: () => ({
    addAdEventListener: () => noop,
    load: noop,
    show: noopAsync,
  }),
};

// BannerAd is a React component — returns null so it renders nothing
const BannerAd = () => null;

const mobileAds = () => ({
  initialize: noopAsync,
  setRequestConfiguration: noopAsync,
});

// Mirrors the real enum's string values so code reading MaxAdContentRating.T
// (see app/_layout.tsx) works under test.
const MaxAdContentRating = { G: 'G', PG: 'PG', T: 'T', MA: 'MA' };

// UMP (EEA/UK consent). The real enums are numeric for debug geography and
// string for the status values -- mirrored exactly so code comparing against
// them behaves the same under the mock.
const AdsConsentDebugGeography = {
  DISABLED: 0,
  EEA: 1,
  NOT_EEA: 2,
  REGULATED_US_STATE: 3,
  OTHER: 4,
};

const AdsConsentStatus = {
  UNKNOWN: 'UNKNOWN',
  REQUIRED: 'REQUIRED',
  NOT_REQUIRED: 'NOT_REQUIRED',
  OBTAINED: 'OBTAINED',
};

const AdsConsentPrivacyOptionsRequirementStatus = {
  UNKNOWN: 'UNKNOWN',
  REQUIRED: 'REQUIRED',
  NOT_REQUIRED: 'NOT_REQUIRED',
};

// Stands in for a player outside the EEA: no form to show, ads allowed, and no
// privacy-options entry point required -- so the Settings row stays hidden in
// Expo Go and under test, exactly as it would in an unregulated region.
const CONSENT_INFO = {
  status: AdsConsentStatus.NOT_REQUIRED,
  canRequestAds: true,
  privacyOptionsRequirementStatus: AdsConsentPrivacyOptionsRequirementStatus.NOT_REQUIRED,
  isConsentFormAvailable: false,
};

const AdsConsent = {
  gatherConsent: async () => CONSENT_INFO,
  requestInfoUpdate: async () => CONSENT_INFO,
  loadAndShowConsentFormIfRequired: async () => CONSENT_INFO,
  showForm: async () => CONSENT_INFO,
  showPrivacyOptionsForm: async () => CONSENT_INFO,
  getConsentInfo: async () => CONSENT_INFO,
  getTCString: async () => '',
  getUserChoices: async () => ({}),
  reset: noop,
};

module.exports = {
  __esModule: true,
  default: mobileAds,
  mobileAds,
  TestIds,
  BannerAdSize,
  BannerAd,
  AdEventType,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
  MaxAdContentRating,
  AdsConsent,
  AdsConsentDebugGeography,
  AdsConsentStatus,
  AdsConsentPrivacyOptionsRequirementStatus,
};
