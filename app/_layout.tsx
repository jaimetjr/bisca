import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
import { View, Platform } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import mobileAds from 'react-native-google-mobile-ads';
import Colors from '@/shared/constants/colors';
import { GuestModeProvider, useGuestMode } from '@shared/hooks/useGuestMode';
import { LanguageProvider } from '@shared/hooks/useLanguage';
import { queryClient } from '@/shared/query-client';
import { EntitlementProvider } from '@shared/hooks/useEntitlement';
import { RewardsProvider } from '@shared/hooks/useRewards';

// Initialize AdMob once on startup (no-op on web)
if (Platform.OS !== 'web') {
  mobileAds().initialize().catch(() => {});
}

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

const tokenCache = {
  async getToken(key: string) {
    try { return await SecureStore.getItemAsync(key); } catch { return null; }
  },
  async saveToken(key: string, value: string) {
    try { await SecureStore.setItemAsync(key, value); } catch {}
  },
  async clearToken(key: string) {
    try { await SecureStore.deleteItemAsync(key); } catch {}
  },
};

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { isGuest, isLoaded: guestLoaded } = useGuestMode();
  const segments = useSegments();
  const router = useRouter();

  const segs = segments as string[];
  const inAuthGroup = segs[0] === '(auth)';
  const onLoginScreen = segs[1] === 'login';

  useEffect(() => {
    if (!clerkLoaded || !guestLoaded) return;

    // Unauthenticated, non-guest user outside auth screens → go to login
    if (!isSignedIn && !isGuest && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    // Guest just enabled while still on auth screen → go home
    if (isGuest && inAuthGroup) {
      router.replace('/');
      return;
    }

    // Signed-in user on login screen → always go through complete-profile
    // (complete-profile will redirect home immediately if profile already exists)
    if (isSignedIn && inAuthGroup && onLoginScreen) {
      router.replace('/(auth)/complete-profile');
    }
  }, [isSignedIn, clerkLoaded, guestLoaded, isGuest, inAuthGroup, onLoginScreen, router]);

  return <>{children}</>;
}

function AppWithEntitlement() {
  const { userId } = useAuth();
  return (
    <EntitlementProvider userId={userId}>
      <RewardsProvider>
        <AuthGuard>
          <StatusBar style="light" backgroundColor="#000000" />
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
          <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
            <AppWithEntitlement />
          </ClerkProvider>
        </GuestModeProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}
