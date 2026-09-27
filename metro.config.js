const path = require("path");
// Sentry's wrapper around expo/metro-config: same config shape, plus debug-ID
// injection + source-map handling so production stack traces are readable.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

config.resolver.extraNodeModules = {
  buffer: require.resolve("buffer/"),
};

// react-native-google-mobile-ads, react-native-purchases and
// react-native-device-info are native modules that crash Expo Go. Redirect to
// lightweight mocks during development.
// In EAS builds, EAS_BUILD=true is set automatically, so real modules are used.
if (!process.env.EAS_BUILD) {
  const originalResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'react-native-google-mobile-ads') {
      return { filePath: path.resolve(__dirname, 'mocks/react-native-google-mobile-ads.js'), type: 'sourceFile' };
    }
    if (moduleName === 'react-native-purchases') {
      return { filePath: path.resolve(__dirname, 'mocks/react-native-purchases.js'), type: 'sourceFile' };
    }
    if (moduleName === 'react-native-device-info') {
      return { filePath: path.resolve(__dirname, 'mocks/react-native-device-info.js'), type: 'sourceFile' };
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
