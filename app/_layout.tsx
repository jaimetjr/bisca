import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Asset } from 'expo-asset';
import { View, Platform } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';
import * as Sentry from '@sentry/react-native';
import Colors from '@/shared/constants/colors';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@shared/hooks/useAuth';
import { GuestModeProvider, useGuestMode } from '@shared/hooks/useGuestMode';
import { LanguageProvider } from '@shared/hooks/useLanguage';
import { CardBackProvider } from '@shared/hooks/useCardBack';
import { queryClient } from '@/shared/query-client';
import { EntitlementProvider } from '@shared/hooks/useEntitlement';
import { RewardsProvider } from '@shared/hooks/useRewards';
import { consumePendingInvite } from '@/shared/lib/pending-invite';
import { consumePendingAuthMode } from '@/shared/lib/auth-nav-intent';
import { ALL_CARD_ASSETS } from '@/components/CardSprite';

// Crash/error reporting. The DSN is a public identifier (safe to embed) and is
// only set for EAS preview/production builds via eas.json — `enabled` keeps dev
// runs and DSN-less builds silent. tracesSampleRate 0 = errors only, no perf
// tracing; sendDefaultPii false = never attach user identifiers automatically.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0,
});

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
      // 13+ general-audience config (see shared/constants/policy.ts):
      // - maxAdContentRating T caps ad creatives at Teen so a 13-year-old never
      //   sees a Mature (MA) ad. The app's store rating is Everyone, so this
      //   also keeps served ads consistent with that rating.
      // - tagForChildDirectedTreatment false declares we are NOT a child-directed
      //   (<13, COPPA) app. Never set this true here — it would opt the app into
      //   the children's regime we deliberately gate out.
      // Personalization is already handled per-request: both ad hooks pass
      // requestNonPersonalizedAdsOnly: true, so no TFUA tag is needed.
      await mobileAds().setRequestConfiguration({
        testDeviceIdentifiers,
        maxAdContentRating: MaxAdContentRating.T,
        tagForChildDirectedTreatment: false,
      });
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
      const mode = consumePendingAuthMode();
      router.replace(mode ? { pathname: '/(auth)/login', params: { mode } } : '/(auth)/login');
      return;
    }

    // Hard email-verification gate: signed in but unverified → verify screen,
    // and block everything else until verified.
    if (isSignedIn && !emailVerified) {
      if (!onVerifyScreen) router.replace('/(auth)/verify-email');
      return;
    }

    // Verified user or guest still on an auth screen → resume a parked invite
    // (deep link that got bounced to login — see app/join.tsx) or go home.
    if ((isSignedIn || isGuest) && inAuthGroup) {
      void (async () => {
        const invited = await consumePendingInvite();
        if (invited) {
          router.replace({ pathname: '/setup', params: { mode: 'online', roomCode: invited } });
        } else {
          router.replace('/');
        }
      })();
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

function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Warm the card art while the player is still on the home and setup screens,
  // so the table opens with every image resident instead of decoding the deck a
  // card at a time during the first hand. Fire-and-forget on purpose: nothing
  // renders behind it and a failure just means the old lazy path, so it must
  // never block the tree or surface an error.
  useEffect(() => {
    Asset.loadAsync(ALL_CARD_ASSETS).catch(() => {});
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.backgroundDark }} />;
  }

  return (
    <ErrorBoundary
      onError={(error, componentStack) =>
        Sentry.captureException(error, { extra: { componentStack } })
      }
    >
      <LanguageProvider>
        <CardBackProvider>
          <QueryClientProvider client={queryClient}>
            <GuestModeProvider>
              <AuthProvider>
                <AppWithEntitlement />
              </AuthProvider>
            </GuestModeProvider>
          </QueryClientProvider>
        </CardBackProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

// Sentry.wrap adds the outermost error handler (catches errors the render-tree
// ErrorBoundary above can't, e.g. in the providers themselves) and native-crash
// context. No-op while Sentry is disabled (dev / DSN-less builds).
export default Sentry.wrap(RootLayout);
