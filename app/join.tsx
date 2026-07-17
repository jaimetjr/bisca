import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Colors from '@/shared/constants/colors';

// Deep-link entry for shared invites — bisca:///join?code=X today, https App
// Links later (see docs/superpowers/specs/2026-07-17-share-invite-links-design.md).
// Forwards to setup with the join tab preselected and the code prefilled, so
// the recipient only enters a name. Malformed codes fall back to home.
export default function JoinRedirect() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    const normalized = (code ?? '').trim().toUpperCase();
    if (/^[A-Z0-9]{4,6}$/.test(normalized)) {
      router.replace({ pathname: '/setup', params: { mode: 'online', roomCode: normalized } });
    } else {
      router.replace('/');
    }
  }, [code]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundDark, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.gold} />
    </View>
  );
}
