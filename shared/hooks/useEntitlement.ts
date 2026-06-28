import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import Purchases, { PurchasesPackage, CustomerInfoUpdateListener } from 'react-native-purchases';

// Platform-specific public SDK keys from the RevenueCat dashboard. Empty when
// not configured (e.g. ads-only builds) — the provider skips setup in that case.
const REVENUECAT_API_KEY =
  (Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS
    : process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID) ?? '';

/** The entitlement identifier configured in RevenueCat dashboard */
export const REMOVE_ADS_ENTITLEMENT = 'remove_ads';

interface EntitlementCtx {
  isPremium: boolean;
  loading: boolean;
  purchase: () => Promise<boolean>;
  restore: () => Promise<boolean>;
}

const EntitlementContext = createContext<EntitlementCtx>({
  isPremium: false,
  loading: false,
  purchase: async () => false,
  restore: async () => false,
});

interface EntitlementProviderProps {
  userId?: string | null;
  children: React.ReactNode;
}

export function EntitlementProvider({ userId, children }: EntitlementProviderProps) {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No RevenueCat key configured (e.g. ad-only / sandbox test builds): skip
    // setup entirely. The native SDK throws a fatal "API key must be set"
    // exception on an empty key, which would crash the app on launch.
    if (Platform.OS === 'web' || !REVENUECAT_API_KEY) {
      setLoading(false);
      return;
    }

    Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: userId ?? undefined,
    });

    Purchases.getCustomerInfo()
      .then(info => {
        setIsPremium(REMOVE_ADS_ENTITLEMENT in info.entitlements.active);
      })
      .catch(() => {
        // Fail silently — ads will show as fallback
      })
      .finally(() => setLoading(false));

    const onCustomerInfo: CustomerInfoUpdateListener = info => {
      setIsPremium(REMOVE_ADS_ENTITLEMENT in info.entitlements.active);
    };
    Purchases.addCustomerInfoUpdateListener(onCustomerInfo);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(onCustomerInfo);
    };
  }, [userId]);

  const purchase = useCallback(async (): Promise<boolean> => {
    try {
      const offerings = await Purchases.getOfferings();
      const pkg: PurchasesPackage | undefined = offerings.current?.availablePackages[0];
      if (!pkg) return false;
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = REMOVE_ADS_ENTITLEMENT in customerInfo.entitlements.active;
      setIsPremium(active);
      return active;
    } catch {
      return false;
    }
  }, []);

  const restore = useCallback(async (): Promise<boolean> => {
    try {
      const info = await Purchases.restorePurchases();
      const active = REMOVE_ADS_ENTITLEMENT in info.entitlements.active;
      setIsPremium(active);
      return active;
    } catch {
      return false;
    }
  }, []);

  return React.createElement(
    EntitlementContext.Provider,
    { value: { isPremium, loading, purchase, restore } },
    children
  );
}

export function useEntitlement(): EntitlementCtx {
  return useContext(EntitlementContext);
}
