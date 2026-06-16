import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Colors from '@/shared/constants/colors';
import { isAtLeast18, dobToISO, formatLocaleDate, getLocaleDatePlaceholder, isoToLocaleDate } from '@shared/lib/date';
import { getApiUrl } from '@shared/query-client';
import { t } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';

export default function CompleteProfileScreen() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  useLanguage(); // subscribe to language changes so t() output updates

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [loading, setLoading] = useState(true); // start loading while we check
  const [errorMsg, setErrorMsg] = useState('');
  const checked = useRef(false);

  useEffect(() => {
    if (!user || checked.current) return;
    checked.current = true;

    (async () => {
      // Wait for a valid token — Clerk may need a moment after sign-up
      let token: string | null = null;
      for (let i = 0; i < 5; i++) {
        token = await getToken();
        if (token) break;
        await new Promise(r => setTimeout(r, 500));
      }

      if (!token) {
        setErrorMsg(t('auth.errSessionNotReady'));
        setLoading(false);
        return;
      }

      try {
        // Check if profile already exists (e.g. returning user signed in with Google)
        const res = await fetch(`${getApiUrl()}api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          // Profile exists — skip form and go home
          router.replace('/');
          return;
        }
      } catch {
        // Network error — show form anyway so user can try
      }

      // If coming from email registration, all data is ready — auto-submit without showing the form
      try {
        const raw = await AsyncStorage.getItem('pending_profile');
        if (raw) {
          const pending = JSON.parse(raw);
          if (pending.firstName && pending.lastName && pending.dateOfBirth) {
            const res = await fetch(`${getApiUrl()}api/users/profile`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify(pending),
            });
            if (res.ok) {
              await AsyncStorage.removeItem('pending_profile');
              router.replace('/');
              return;
            }
            // Submission failed — fall through to show the form pre-filled
            if (pending.firstName) setFirstName(pending.firstName);
            if (pending.lastName) setLastName(pending.lastName);
            setDateOfBirth(isoToLocaleDate(pending.dateOfBirth));
            setErrorMsg(t('auth.errSaveFailedRetry'));
            setLoading(false);
            return;
          }
        }
      } catch {}

      // Google OAuth — pre-fill name from Clerk, ask for missing DOB
      if (user?.firstName) setFirstName(user.firstName);
      if (user?.lastName) setLastName(user.lastName);

      setLoading(false);
    })();
  }, [user, getToken, router]);

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg(t('auth.errNameRequired'));
      return;
    }
    if (!dateOfBirth.trim()) {
      setErrorMsg(t('auth.errDobRequired'));
      return;
    }
    if (!isAtLeast18(dateOfBirth)) {
      setErrorMsg(t('auth.errUnder18'));
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const token = await getToken();
      const res = await fetch(`${getApiUrl()}api/users/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth: dobToISO(dateOfBirth),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? t('auth.errSaveFailed'));
        return;
      }

      // Clear pending profile data
      await AsyncStorage.removeItem('pending_profile');
      router.replace('/');
    } catch {
      setErrorMsg(t('auth.errNetwork'));
    } finally {
      setLoading(false);
    }
  };

  // Still doing the initial profile check — show a spinner
  if (loading && !errorMsg) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.backgroundDark, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.gold} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.logoContainer}>
        <MaterialCommunityIcons name="account-circle" size={56} color={Colors.gold} />
      </View>
      <Text style={styles.title}>{t('auth.completeProfile')}</Text>
      <Text style={styles.subtitle}>{t('auth.completeProfileSubtitle')}</Text>

      <TextInput
        style={styles.input}
        value={firstName}
        onChangeText={setFirstName}
        placeholder={t('auth.firstName')}
        placeholderTextColor={Colors.textSecondary}
        autoCapitalize="words"
      />
      <TextInput
        style={styles.input}
        value={lastName}
        onChangeText={setLastName}
        placeholder={t('auth.lastName')}
        placeholderTextColor={Colors.textSecondary}
        autoCapitalize="words"
      />
      <TextInput
        style={styles.input}
        value={dateOfBirth}
        onChangeText={(v) => setDateOfBirth(formatLocaleDate(v))}
        placeholder={`${t('auth.dateOfBirth')} (${getLocaleDatePlaceholder()})`}
        placeholderTextColor={Colors.textSecondary}
        keyboardType="number-pad"
        maxLength={10}
      />

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.textDark} />
        ) : (
          <Text style={styles.primaryBtnText}>{t('auth.saveContinue')}</Text>
        )}
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 28,
    paddingVertical: 48,
    justifyContent: 'center',
    gap: 14,
  },
  logoContainer: { alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 32, fontFamily: 'Inter_700Bold', color: Colors.gold, textAlign: 'center', letterSpacing: 1 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  input: {
    backgroundColor: Colors.whiteAlpha, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
    fontSize: 15, fontFamily: 'Inter_500Medium', color: Colors.white, borderWidth: 1, borderColor: Colors.whiteAlpha,
  },
  primaryBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  primaryBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.textDark },
  errorText: { color: Colors.danger, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
