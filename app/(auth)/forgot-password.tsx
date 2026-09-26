import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import { useContentPadding } from '@shared/hooks/useContentPadding';
import { useAuth } from '@shared/hooks/useAuth';
import { t } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';
import { validatePassword } from '@shared/lib/validation/password';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';

export default function ForgotPasswordScreen() {
  const contentPadding = useContentPadding(28);
  const { requestPasswordReset, resetPassword } = useAuth();
  const router = useRouter();
  useLanguage();

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleRequest = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const result = await requestPasswordReset(email.trim());
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      // Server responds generically whether or not the email exists — advance
      // to the reset step regardless so we don't reveal which emails exist.
      setStep('reset');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setErrorMsg('');
    if (code.length < 6) {
      setErrorMsg(t('auth.errInvalidCode'));
      return;
    }
    if (!validatePassword(newPassword, { email: email.trim() }).ok) {
      setErrorMsg(t('auth.errPasswordWeak'));
      return;
    }
    setLoading(true);
    try {
      const result = await resetPassword(email.trim(), code.trim(), newPassword);
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      router.replace('/(auth)/login');
    } finally {
      setLoading(false);
    }
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
        <MaterialCommunityIcons name="lock-reset" size={56} color={Colors.gold} />
      </View>
      <Text style={styles.title}>{t('auth.forgotTitle')}</Text>
      <Text style={styles.subtitle}>
        {step === 'request' ? t('auth.forgotSubtitle') : t('auth.resetSubtitle', { email })}
      </Text>

      {step === 'request' ? (
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.email')}
          placeholderTextColor={Colors.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoFocus
        />
      ) : (
        <>
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
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={t('auth.newPassword')}
            placeholderTextColor={Colors.textSecondary}
            secureTextEntry
          />
          <PasswordStrengthMeter password={newPassword} context={{ email }} />
        </>
      )}

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      {step === 'request' ? (
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          onPress={handleRequest}
          disabled={loading || !email}
        >
          {loading ? <ActivityIndicator color={Colors.textDark} /> : <Text style={styles.primaryBtnText}>{t('auth.sendCode')}</Text>}
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          onPress={handleReset}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={Colors.textDark} /> : <Text style={styles.primaryBtnText}>{t('auth.resetPassword')}</Text>}
        </Pressable>
      )}

      <Pressable onPress={() => router.replace('/(auth)/login')}>
        <Text style={styles.mutedLink}>{t('auth.backToSignIn')}</Text>
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
  input: {
    backgroundColor: Colors.whiteAlpha, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
    fontSize: 15, fontFamily: 'Inter_500Medium', color: Colors.white, borderWidth: 1, borderColor: Colors.whiteAlpha,
  },
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
  mutedLink: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  errorText: { color: Colors.dangerText, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
