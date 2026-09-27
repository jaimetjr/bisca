// Stub for Expo Go — the real module is native and crashes on import there.
// In EAS builds (EAS_BUILD=true), metro resolves the real package instead.
//
// getMaxMemory rejects on purpose: app/_layout.tsx treats an unknown heap as
// "constrained" and preloads only the card backs, which is the safe path.

const unavailable = async () => {
  throw new Error('react-native-device-info is not available in Expo Go');
};

const DeviceInfo = {
  getMaxMemory: unavailable,
};

module.exports = {
  __esModule: true,
  default: DeviceInfo,
  ...DeviceInfo,
};
