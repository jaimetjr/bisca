import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView, Platform, Alert, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Svg, { Path } from 'react-native-svg';
import Colors from '@/shared/constants/colors';
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

function isoToDob(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function ProfileScreen() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  const hasGoogle = user?.externalAccounts.some(a => a.provider === 'google') ?? false;
  const hasPassword = user?.passwordEnabled ?? false;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dirty, setDirty] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [changeNewPassword, setChangeNewPassword] = useState('');
  const [changeConfirmPassword, setChangeConfirmPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordSaving, setChangePasswordSaving] = useState(false);

  const [googleLinking, setGoogleLinking] = useState(false);
  const [googleError, setGoogleError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${getApiUrl()}api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setFirstName(data.firstName ?? '');
          setLastName(data.lastName ?? '');
          setDateOfBirth(data.dateOfBirth ? isoToDob(data.dateOfBirth) : '');
        }
      } catch {
        setErrorMsg('Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg('Please enter your first and last name');
      return;
    }
    if (!dateOfBirth.trim()) {
      setErrorMsg('Please enter your date of birth (DD/MM/YYYY)');
      return;
    }
    if (!isAtLeast18(dateOfBirth)) {
      setErrorMsg('You must be at least 18 years old');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      const token = await getToken();
      const res = await fetch(`${getApiUrl()}api/users/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth: dobToISO(dateOfBirth),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? 'Failed to save');
        return;
      }
      setDirty(false);
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch {
      setErrorMsg('Network error — please try again');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setChangePasswordError('');
    if (!currentPassword) { setChangePasswordError('Enter your current password'); return; }
    if (!changeNewPassword) { setChangePasswordError('Enter a new password'); return; }
    if (changeNewPassword !== changeConfirmPassword) { setChangePasswordError('Passwords do not match'); return; }
    if (changeNewPassword.length < 8) { setChangePasswordError('Password must be at least 8 characters'); return; }
    setChangePasswordSaving(true);
    try {
      await user!.updatePassword({ currentPassword, newPassword: changeNewPassword, signOutOfOtherSessions: false });
      setCurrentPassword('');
      setChangeNewPassword('');
      setChangeConfirmPassword('');
      Alert.alert('Done', 'Password changed successfully.');
    } catch (e: any) {
      setChangePasswordError(e?.errors?.[0]?.message ?? 'Failed to change password');
    } finally {
      setChangePasswordSaving(false);
    }
  };

  const handleConnectGoogle = async () => {
    if (!user) return;
    setGoogleLinking(true);
    setGoogleError('');
    try {
      const redirectUrl = Linking.createURL('/');
      const externalAccount = await user.createExternalAccount({
        strategy: 'oauth_google',
        redirectUrl,
      });
      const url = externalAccount.verification?.externalVerificationRedirectURL?.toString();
      if (!url) throw new Error('Could not start Google connection');
      await WebBrowser.openAuthSessionAsync(url, redirectUrl);
      await user.reload();
    } catch (e: any) {
      setGoogleError(e?.errors?.[0]?.message ?? 'Failed to connect Google');
    } finally {
      setGoogleLinking(false);
    }
  };

  const handleSetPassword = async () => {
    setPasswordError('');
    if (!newPassword) { setPasswordError('Enter a password'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
    setPasswordSaving(true);
    try {
      await user!.updatePassword({ newPassword, signOutOfOtherSessions: false });
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Done', 'Password set successfully.');
    } catch (e: any) {
      setPasswordError(e?.errors?.[0]?.message ?? 'Failed to set password');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 20 }]}>
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.white} />
        </Pressable>
        <Text style={styles.title}>Profile</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionHeader}>Personal Information</Text>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>First Name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={(v) => { setFirstName(v); setDirty(true); }}
              placeholder="First Name"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={(v) => { setLastName(v); setDirty(true); }}
              placeholder="Last Name"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Date of Birth</Text>
            <TextInput
              style={styles.input}
              value={dateOfBirth}
              onChangeText={(v) => { setDateOfBirth(v); setDirty(true); }}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </View>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          {dirty && (
            <Pressable
              style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.textDark} />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </Pressable>
          )}

          <Text style={styles.sectionHeader}>Connected Accounts</Text>

          <View style={styles.card}>
            <View style={styles.accountRow}>
              <View style={styles.accountRowLeft}>
                <GoogleLogo size={20} />
                <Text style={styles.accountLabel}>Google</Text>
              </View>
              {hasGoogle ? (
                <View style={styles.connectedBadge}>
                  <MaterialCommunityIcons name="check-circle" size={14} color={Colors.gold} />
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.8 }, googleLinking && { opacity: 0.6 }]}
                  onPress={handleConnectGoogle}
                  disabled={googleLinking}
                >
                  {googleLinking
                    ? <ActivityIndicator size="small" color={Colors.textDark} />
                    : <Text style={styles.linkBtnText}>Connect</Text>}
                </Pressable>
              )}
            </View>
            {googleError ? <Text style={styles.errorText}>{googleError}</Text> : null}

            {!hasPassword && (
              <>
                <View style={styles.rowDivider} />
                <Text style={styles.fieldLabel}>Set a Password</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="New password"
                  placeholderTextColor={Colors.textSecondary}
                  secureTextEntry
                />
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor={Colors.textSecondary}
                  secureTextEntry
                />
                {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
                <Pressable
                  style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }, passwordSaving && { opacity: 0.6 }]}
                  onPress={handleSetPassword}
                  disabled={passwordSaving}
                >
                  {passwordSaving
                    ? <ActivityIndicator color={Colors.textDark} />
                    : <Text style={styles.saveBtnText}>Set Password</Text>}
                </Pressable>
              </>
            )}

            {hasPassword && (
              <>
                <View style={styles.rowDivider} />
                <Text style={styles.fieldLabel}>Change Password</Text>
                <TextInput
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Current password"
                  placeholderTextColor={Colors.textSecondary}
                  secureTextEntry
                />
                <TextInput
                  style={styles.input}
                  value={changeNewPassword}
                  onChangeText={setChangeNewPassword}
                  placeholder="New password"
                  placeholderTextColor={Colors.textSecondary}
                  secureTextEntry
                />
                <TextInput
                  style={styles.input}
                  value={changeConfirmPassword}
                  onChangeText={setChangeConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor={Colors.textSecondary}
                  secureTextEntry
                />
                {changePasswordError ? <Text style={styles.errorText}>{changePasswordError}</Text> : null}
                <Pressable
                  style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }, changePasswordSaving && { opacity: 0.6 }]}
                  onPress={handleChangePassword}
                  disabled={changePasswordSaving}
                >
                  {changePasswordSaving
                    ? <ActivityIndicator color={Colors.textDark} />
                    : <Text style={styles.saveBtnText}>Change Password</Text>}
                </Pressable>
              </>
            )}
          </View>

        </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: -8 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.gold },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 24, gap: 8 },
  sectionHeader: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 4,
  },
  card: {
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.whiteAlpha2,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: Colors.white,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  errorText: { color: Colors.danger, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  saveBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.textDark },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountLabel: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: Colors.white,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  connectedText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
  },
  linkBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    minWidth: 72,
    alignItems: 'center',
  },
  linkBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textDark,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.whiteAlpha,
    marginVertical: 4,
  },
});
