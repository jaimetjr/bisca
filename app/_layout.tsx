import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { View, Platform } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import mobileAds from 'react-native-google-mobile-ads';
import Colors from '@/shared/constants/colors';
import { AuthProvider, useAuth } from '@shared/hooks/useAuth';
import { GuestModeProvider, useGuestMode } from '@shared/hooks/useGuestMode';
import { LanguageProvider } from '@shared/hooks/useLanguage';
import { queryClient } from '@/shared/query-client';
import { EntitlementProvider } from '@shared/hooks/useEntitlement';
import { RewardsProvider } from '@shared/hooks/useRewards';

// Initialize AdMob once on startup (no-op on web). Register test devices FIRST
// so that even with real ad-unit IDs, our own devices keep getting TEST ads —
// showing/clicking real ads on your own build can get the AdMob account banned.
// Emulators are covered by 'EMULATOR'; add a real phone's id via
// EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS (comma-separated; the SDK logs the id on
// first ad request).
if (Platform.OS !== 'web') {
  const testDeviceIdentifiers = [
    'EMULATOR',
    ...(process.env.EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  ];
  (async () => {
    try {
      await mobileAds().setRequestConfiguration({ testDeviceIdentifiers });
    } catch {}
    try {
      await mobileAds().initialize();
    } catch {}
  })();
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded: authLoaded, isSignedIn, emailVerified } = useAuth();
  const { isGuest, isLoaded: guestLoaded } = useGuestMode();
  const segments = useSegments();
  const router = useRouter();

  const segs = segments as string[];
  const inAuthGroup = segs[0] === '(auth)';
  const onVerifyScreen = segs[1] === 'verify-email';

  useEffect(() => {
    if (!authLoaded || !guestLoaded) return;

    // Unauthenticated, non-guest user outside auth screens → go to login
    if (!isSignedIn && !isGuest && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    // Hard email-verification gate: signed in but unverified → verify screen,
    // and block everything else until verified.
    if (isSignedIn && !emailVerified) {
      if (!onVerifyScreen) router.replace('/(auth)/verify-email');
      return;
    }

    // Verified user or guest still on an auth screen → go home
    if ((isSignedIn || isGuest) && inAuthGroup) {
      router.replace('/');
    }
  }, [isSignedIn, emailVerified, authLoaded, guestLoaded, isGuest, inAuthGroup, onVerifyScreen, router]);

  return <>{children}</>;
}

function AppWithEntitlement() {
  const { userId } = useAuth();
  return (
    <EntitlementProvider userId={userId}>
      <RewardsProvider>
        <AuthGuard>
          <StatusBar style="light" backgroundColor={Colors.backgroundDark} />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthGuard>
      </RewardsProvider>
    </EntitlementProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.backgroundDark }} />;
  }

  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <GuestModeProvider>
          <AuthProvider>
            <AppWithEntitlement />
          </AuthProvider>
        </GuestModeProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}
