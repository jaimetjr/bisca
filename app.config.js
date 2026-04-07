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
    extra: {
      ...baseConfig.expo.extra,
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? '',
      },
    },
  },
};
