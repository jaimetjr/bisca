import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import { useContentPadding } from '@shared/hooks/useContentPadding';
import { useAuth } from '@shared/hooks/useAuth';
import { getApiUrl } from '@shared/query-client';
import { t } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';

export default function VerifyEmailScreen() {
  const contentPadding = useContentPadding(28);
  const { getToken, verifyEmail, resendVerification, signOut } = useAuth();
  const router = useRouter();
  useLanguage();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${getApiUrl()}api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setEmail(data.email ?? '');
        }
      } catch {
        // Non-fatal — screen still works without the email shown.
      }
    })();
  }, [getToken]);

  const handleVerify = async () => {
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const result = await verifyEmail(code.trim());
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      // No navigation here: the token now reflects the verified state, and
      // AuthGuard routes to home or resumes a parked invite (see app/join.tsx).
      // An explicit replace('/') would leave the auth group before AuthGuard's
      // effect runs and drop the invite.
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const result = await resendVerification();
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      setInfoMsg(t('auth.codeSent'));
    } finally {
      setResending(false);
    }
  };

  const handleUseDifferent = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: contentPadding }]} keyboardShouldPersistTaps="handled">
      <View style={styles.logoContainer}>
        <MaterialCommunityIcons name="email-check-outline" size={56} color={Colors.gold} />
      </View>
      <Text style={styles.title}>{t('auth.verifyEmailTitle')}</Text>
      <Text style={styles.subtitle}>{t('auth.verifyEmailSubtitle', { email })}</Text>

      <TextInput
        style={styles.codeInput}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        placeholderTextColor={Colors.textSecondary}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
      />

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
      {infoMsg ? <Text style={styles.infoText}>{infoMsg}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        onPress={handleVerify}
        disabled={loading || code.length < 6}
      >
        {loading ? (
          <ActivityIndicator color={Colors.textDark} />
        ) : (
          <Text style={styles.primaryBtnText}>{t('auth.verify')}</Text>
        )}
      </Pressable>

      <Pressable onPress={handleResend} disabled={resending}>
        <Text style={styles.linkText}>
          {resending ? '…' : t('auth.resendCode')}
        </Text>
      </Pressable>

      <Pressable onPress={handleUseDifferent}>
        <Text style={styles.mutedLink}>{t('auth.useDifferentAccount')}</Text>
      </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.backgroundDark },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingVertical: 48,
    justifyContent: 'center',
    gap: 16,
  },
  logoContainer: { alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold', color: Colors.gold, textAlign: 'center', letterSpacing: 1 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  codeInput: {
    backgroundColor: Colors.whiteAlpha, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16,
    fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.white, borderWidth: 1, borderColor: Colors.whiteAlpha,
    letterSpacing: 12, textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.textDark },
  linkText: { color: Colors.gold, fontSize: 14, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  mutedLink: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  errorText: { color: Colors.danger, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  infoText: { color: Colors.gold, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
