import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Colors from '@/shared/constants/colors';
import { useAuth } from '@shared/hooks/useAuth';
import { useGuestMode } from '@shared/hooks/useGuestMode';
import { storePendingInvite } from '@/shared/lib/pending-invite';

// Deep-link entry for shared invites — bisca:///join?code=X today, https App
// Links later (see docs/superpowers/specs/2026-07-17-share-invite-links-design.md).
// A user who can play goes straight to setup with the join tab preselected and
// the code prefilled. A user who must authenticate first gets bounced to login
// by AuthGuard — we park the code so AuthGuard can resume the invite afterward.
export default function JoinRedirect() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { isLoaded: authLoaded, isSignedIn, emailVerified } = useAuth();
  const { isLoaded: guestLoaded, isGuest } = useGuestMode();

  useEffect(() => {
    if (!authLoaded || !guestLoaded) return;
    const normalized = (code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(normalized)) {
      router.replace('/');
      return;
    }
    if ((isSignedIn && emailVerified) || isGuest) {
      router.replace({ pathname: '/setup', params: { mode: 'online', roomCode: normalized } });
    } else {
      void storePendingInvite(normalized);
    }
  }, [code, authLoaded, guestLoaded, isSignedIn, emailVerified, isGuest]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundDark, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.gold} />
    </View>
  );
}
