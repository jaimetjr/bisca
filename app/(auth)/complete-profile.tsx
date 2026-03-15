import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Colors from '@/shared/constants/colors';
import { isAtLeast18, dobToISO } from '@shared/lib/date';
import { getApiUrl } from '@shared/query-client';

export default function CompleteProfileScreen() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();

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
      try {
        // Check if profile already exists (e.g. returning user signed in with Google)
        const token = await getToken();
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

      // Pre-fill name from Clerk (populated from Google OAuth)
      if (user?.firstName) setFirstName(user.firstName);
      if (user?.lastName) setLastName(user.lastName);

      // If coming from email registration, pick up pending profile data
      try {
        const raw = await AsyncStorage.getItem('pending_profile');
        if (raw) {
          const pending = JSON.parse(raw);
          if (pending.firstName) setFirstName(pending.firstName);
          if (pending.lastName) setLastName(pending.lastName);
          // Convert YYYY-MM-DD back to DD/MM/YYYY for the input
          if (pending.dateOfBirth) {
            const [y, m, d] = pending.dateOfBirth.split('-');
            setDateOfBirth(`${d}/${m}/${y}`);
          }
        }
      } catch {}

      setLoading(false);
    })();
  }, [user]);

  const handleSubmit = async () => {
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
        setErrorMsg(data.error ?? 'Failed to save profile');
        return;
      }

      // Clear pending profile data
      await AsyncStorage.removeItem('pending_profile');
      router.replace('/');
    } catch {
      setErrorMsg('Network error — please try again');
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
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.logoContainer}>
        <MaterialCommunityIcons name="account-circle" size={56} color={Colors.gold} />
      </View>
      <Text style={styles.title}>Complete Profile</Text>
      <Text style={styles.subtitle}>Just a few more details before you start playing</Text>

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

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.textDark} />
        ) : (
          <Text style={styles.primaryBtnText}>Save & Continue</Text>
        )}
      </Pressable>
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
