// Stub for Expo Go — RevenueCat only works in EAS builds.
// In production (EAS_BUILD=true), metro resolves the real package instead.

const emptyCustomerInfo = { entitlements: { active: {} } };

const Purchases = {
  configure: () => {},
  getCustomerInfo: async () => emptyCustomerInfo,
  getOfferings: async () => ({ current: null, all: {} }),
  purchasePackage: async () => ({ customerInfo: emptyCustomerInfo }),
  restorePurchases: async () => emptyCustomerInfo,
  addCustomerInfoUpdateListener: () => () => {},
  removeCustomerInfoUpdateListener: () => {},
};

module.exports = {
  __esModule: true,
  default: Purchases,
  ...Purchases,
};
