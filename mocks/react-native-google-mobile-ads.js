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
};
