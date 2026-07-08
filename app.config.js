const baseConfig = require('./app.json');

const plugins = baseConfig.expo.plugins
  .filter((p) => p !== 'react-native-google-mobile-ads');

plugins.push([
  'react-native-google-mobile-ads',
  {
    androidAppId: process.env.ADMOB_APP_ID_ANDROID ?? '',
    iosAppId: process.env.ADMOB_APP_ID_IOS ?? '',
  },
]);

module.exports = {
  ...baseConfig,
  expo: {
    ...baseConfig.expo,
    plugins,
    android: {
      ...baseConfig.expo.android,
      // Cleartext HTTP is only needed in development, where the app talks to
      // http://10.0.2.2:5000. EAS sets EAS_BUILD_PROFILE per build profile;
      // local runs (unset) count as development. Preview/production talk HTTPS.
      usesCleartextTraffic:
        (process.env.EAS_BUILD_PROFILE ?? 'development') === 'development',
    },
    extra: {
      ...baseConfig.expo.extra,
    },
  },
};
