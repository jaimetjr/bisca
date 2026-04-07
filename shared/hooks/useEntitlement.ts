import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';

const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';

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
    if (Platform.OS === 'web') {
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

    const removeListener = Purchases.addCustomerInfoUpdateListener(info => {
      setIsPremium(REMOVE_ADS_ENTITLEMENT in info.entitlements.active);
    });

    return () => {
      if (typeof removeListener === 'function') removeListener();
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
