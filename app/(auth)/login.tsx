import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { useSignIn, useSignUp, useOAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import Colors from '@/shared/constants/colors';
import { useGuestMode } from '@shared/hooks/useGuestMode';
import { isAtLeast18, dobToISO } from '@shared/lib/date';
import { getApiUrl } from '@shared/query-client';

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <Path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </Svg>
  );
}

export default function LoginScreen() {
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const { enableGuestMode } = useGuestMode();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setErrorMsg('');
    try {
      const { createdSessionId, setActive } = await startOAuthFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // Always go to complete-profile — it will redirect home if profile already exists
        router.replace('/(auth)/complete-profile');
      }
    } catch (e: any) {
      setErrorMsg(e?.errors?.[0]?.message ?? 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!signInLoaded || !signUpLoaded) return;
    setLoading(true);
    setErrorMsg('');
    try {
      if (isRegistering) {
        if (!firstName.trim() || !lastName.trim()) {
          setErrorMsg('Please enter your first and last name');
          return;
        }
        if (!dateOfBirth.trim()) {
          setErrorMsg('Please enter your date of birth (DD/MM/YYYY)');
          return;
        }
        if (!isAtLeast18(dateOfBirth)) {
          setErrorMsg('You must be at least 18 years old to create an account');
          return;
        }
        await signUp!.create({
          emailAddress: email,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
        await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
        setPendingVerification(true);
      } else {
        const result = await signIn!.create({ identifier: email, password });
        if (result.status === 'complete') {
          await setSignInActive!({ session: result.createdSessionId });
        }
      }
    } catch (e: any) {
      setErrorMsg(e?.errors?.[0]?.message ?? 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!signUpLoaded) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const result = await signUp!.attemptEmailAddressVerification({ code: verifyCode });
      if (result.status === 'complete') {
        await setSignUpActive!({ session: result.createdSessionId });
        // Store profile data for complete-profile screen to pick up
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.setItem('pending_profile', JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth: dobToISO(dateOfBirth),
        }));
        router.replace('/(auth)/complete-profile');
      }
    } catch (e: any) {
      setErrorMsg(e?.errors?.[0]?.message ?? 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestMode = async () => {
    await enableGuestMode();
    // AuthGuard detects isGuest=true and navigates to home
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.logoContainer}>
        <MaterialCommunityIcons name="cards-playing" size={56} color={Colors.gold} />
      </View>
      <Text style={styles.title}>Bisca</Text>
      <Text style={styles.subtitle}>Sign in to track your stats and play online</Text>

      {!pendingVerification ? (
        <>
          {/* Google sign-in — not available on web */}
          {Platform.OS !== 'web' && (
            <Pressable
              style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.85 }]}
              onPress={handleGoogleSignIn}
              disabled={googleLoading || loading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color={Colors.textDark} />
              ) : (
                <GoogleLogo size={20} />
              )}
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </Pressable>
          )}

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          {isRegistering && (
            <>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First Name"
                placeholderTextColor={Colors.textSecondary}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last Name"
                placeholderTextColor={Colors.textSecondary}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.input}
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                placeholder="Date of Birth (DD/MM/YYYY)"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </>
          )}

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={Colors.textSecondary}
            secureTextEntry
          />

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={handleEmailAuth}
            disabled={loading || googleLoading || !email || !password}
          >
            {loading ? (
              <ActivityIndicator color={Colors.textDark} />
            ) : (
              <Text style={styles.primaryBtnText}>{isRegistering ? 'Create Account' : 'Sign In'}</Text>
            )}
          </Pressable>

          <Pressable onPress={() => { setIsRegistering(!isRegistering); setErrorMsg(''); }}>
            <Text style={styles.switchText}>
              {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.75 }]}
            onPress={handleGuestMode}
            disabled={loading}
          >
            <MaterialCommunityIcons name="account-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.guestBtnText}>Continue as Guest</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.verifyHint}>Enter the verification code sent to {email}</Text>
          <TextInput
            style={styles.input}
            value={verifyCode}
            onChangeText={setVerifyCode}
            placeholder="Verification code"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="number-pad"
          />
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={handleVerify}
            disabled={loading || !verifyCode}
          >
            {loading ? <ActivityIndicator color={Colors.textDark} /> : <Text style={styles.primaryBtnText}>Verify</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
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
  title: { fontSize: 44, fontFamily: 'Inter_700Bold', color: Colors.gold, textAlign: 'center', letterSpacing: 2 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 14,
  },
  googleBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.textDark },
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
  verifyHint: { color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  guestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.whiteAlpha, borderRadius: 12, paddingVertical: 14,
  },
  guestBtnText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
});
