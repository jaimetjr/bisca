import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import { useAuth } from '@shared/hooks/useAuth';
import { useGuestMode } from '@shared/hooks/useGuestMode';
import { isAtLeast18, dobToISO, formatLocaleDate, getLocaleDatePlaceholder } from '@shared/lib/date';
import { t } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';
import { validatePassword } from '@shared/lib/validation/password';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const { enableGuestMode } = useGuestMode();
  const router = useRouter();
  useLanguage(); // subscribe to language changes so t() output updates

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleEmailAuth = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (isRegistering) {
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
        if (!validatePassword(password, { email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim() }).ok) {
          setErrorMsg(t('auth.errPasswordWeak'));
          return;
        }
        const result = await signUp({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth: dobToISO(dateOfBirth),
        });
        if (!result.ok) {
          setErrorMsg(result.error);
          return;
        }
        // New accounts are unverified — go straight to the verify screen.
        router.replace('/(auth)/verify-email');
      } else {
        const result = await signIn(email.trim(), password);
        if (!result.ok) {
          setErrorMsg(result.error);
          return;
        }
        // No navigation here: AuthGuard owns the post-auth route. It sends
        // unverified accounts to verify-email and resumes a parked invite
        // (see app/join.tsx) — an explicit replace('/') would leave the auth
        // group before AuthGuard's effect runs and drop the invite.
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestMode = async () => {
    await enableGuestMode();
    // AuthGuard detects isGuest=true and navigates to home
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.logoContainer}>
        <MaterialCommunityIcons name="cards-playing" size={56} color={Colors.gold} />
      </View>
      <Text style={styles.title}>{t('home.title')}</Text>
      <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>

      {isRegistering && (
        <>
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
        </>
      )}

      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.email')}
        placeholderTextColor={Colors.textSecondary}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.password')}
        placeholderTextColor={Colors.textSecondary}
        secureTextEntry
      />

      {isRegistering && (
        <PasswordStrengthMeter
          password={password}
          context={{ email, firstName, lastName }}
        />
      )}

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        onPress={handleEmailAuth}
        disabled={loading || !email || !password}
      >
        {loading ? (
          <ActivityIndicator color={Colors.textDark} />
        ) : (
          <Text style={styles.primaryBtnText}>{isRegistering ? t('auth.createAccount') : t('auth.signIn')}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => { setIsRegistering(!isRegistering); setErrorMsg(''); setEmail(''); setPassword(''); setFirstName(''); setLastName(''); setDateOfBirth(''); }}>
        <Text style={styles.switchText}>
          {isRegistering ? t('auth.haveAccountSignIn') : t('auth.noAccountRegister')}
        </Text>
      </Pressable>

      {!isRegistering && (
        <Pressable onPress={() => router.push('/(auth)/forgot-password')}>
          <Text style={styles.switchText}>{t('auth.forgotPassword')}</Text>
        </Pressable>
      )}

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>{t('auth.or')}</Text>
        <View style={styles.divider} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.75 }]}
        onPress={handleGuestMode}
        disabled={loading}
      >
        <MaterialCommunityIcons name="account-outline" size={18} color={Colors.textSecondary} />
        <Text style={styles.guestBtnText}>{t('auth.continueAsGuest')}</Text>
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
    gap: 14,
  },
  logoContainer: { alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 44, fontFamily: 'Inter_700Bold', color: Colors.gold, textAlign: 'center', letterSpacing: 2 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: Colors.whiteAlpha },
  dividerText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter_400Regular' },
  input: {
    backgroundColor: Colors.whiteAlpha, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
    fontSize: 15, fontFamily: 'Inter_500Medium', color: Colors.white, borderWidth: 1, borderColor: Colors.whiteAlpha,
  },
  primaryBtn: {
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.textDark },
  switchText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  errorText: { color: Colors.danger, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  guestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.whiteAlpha, borderRadius: 12, paddingVertical: 14,
  },
  guestBtnText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
});
