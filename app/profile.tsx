import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView, Platform, Alert, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@shared/hooks/useAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/shared/constants/colors';
import { useContentPadding } from '@shared/hooks/useContentPadding';
import { isOldEnoughToRegister, dobToISO, getLocaleDatePlaceholder, formatLocaleDate, isoToLocaleDate } from '@shared/lib/date';
import { MIN_SIGNUP_AGE } from '@shared/constants/policy';
import { useQueryClient } from '@tanstack/react-query';
import { getApiUrl } from '@shared/query-client';
import { cacheProfileName } from '@shared/hooks/useProfileName';
import { validatePassword } from '@shared/lib/validation/password';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import { t } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';
import { friendlyApiError } from '@/shared/lib/api-errors';

export default function ProfileScreen() {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  useLanguage(); // subscribe to language changes so t() output updates
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const contentPadding = useContentPadding(24);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dirty, setDirty] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [changeNewPassword, setChangeNewPassword] = useState('');
  const [changeConfirmPassword, setChangeConfirmPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordSaving, setChangePasswordSaving] = useState(false);

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
          setFirstName(data.firstName ?? '');
          setLastName(data.lastName ?? '');
          setDateOfBirth(data.dateOfBirth ? isoToLocaleDate(data.dateOfBirth) : '');
        }
      } catch {
        setErrorMsg(t('profile.loadError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg(t('auth.errNameRequired'));
      return;
    }
    if (!dateOfBirth.trim()) {
      setErrorMsg(t('auth.errDobRequired'));
      return;
    }
    if (!isOldEnoughToRegister(dateOfBirth)) {
      setErrorMsg(t('auth.errMinAge', { age: MIN_SIGNUP_AGE }));
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
        setErrorMsg(friendlyApiError(data));
        return;
      }
      // The name is cached in two places that nothing else refreshes: the
      // AsyncStorage copy the setup screen reads on launch, and the ['profile']
      // query, which is `staleTime: Infinity` app-wide and so never refetches
      // on its own. Skipping this left every room labelled with the old name.
      if (userId) await cacheProfileName(userId, `${firstName.trim()} ${lastName.trim()}`);
      void queryClient.invalidateQueries({ queryKey: ['profile'] });

      setDirty(false);
      Alert.alert(t('profile.savedTitle'), t('profile.savedBody'));
    } catch {
      setErrorMsg(t('auth.errNetwork'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setChangePasswordError('');
    if (!currentPassword) { setChangePasswordError(t('profile.errCurrentPasswordRequired')); return; }
    if (!changeNewPassword) { setChangePasswordError(t('profile.errNewPasswordRequired')); return; }
    if (changeNewPassword !== changeConfirmPassword) { setChangePasswordError(t('profile.errPasswordsMismatch')); return; }
    if (!validatePassword(changeNewPassword, { email, firstName, lastName }).ok) {
      setChangePasswordError(t('auth.errPasswordWeak'));
      return;
    }
    setChangePasswordSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiUrl()}api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword: changeNewPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setChangePasswordError(friendlyApiError(data));
        return;
      }
      setCurrentPassword('');
      setChangeNewPassword('');
      setChangeConfirmPassword('');
      Alert.alert(t('profile.passwordChangedTitle'), t('profile.passwordChangedBody'));
    } catch {
      setChangePasswordError(t('auth.errNetwork'));
    } finally {
      setChangePasswordSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 20, paddingHorizontal: contentPadding }]}>
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.white} />
        </Pressable>
        <Text style={styles.title}>{t('profile.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionHeader}>{t('profile.personalInfo')}</Text>

          <View style={styles.card}>
            {email ? (
              <>
                <Text style={styles.fieldLabel}>{t('auth.email')}</Text>
                <View style={[styles.input, styles.readonlyField]}>
                  <Text style={styles.readonlyText}>{email}</Text>
                </View>
              </>
            ) : null}

            <Text style={styles.fieldLabel}>{t('auth.firstName')}</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={(v) => { setFirstName(v); setDirty(true); }}
              placeholder={t('auth.firstName')}
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>{t('auth.lastName')}</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={(v) => { setLastName(v); setDirty(true); }}
              placeholder={t('auth.lastName')}
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>{t('auth.dateOfBirth')}</Text>
            <TextInput
              style={styles.input}
              value={dateOfBirth}
              onChangeText={(v) => { setDateOfBirth(formatLocaleDate(v)); setDirty(true); }}
              placeholder={getLocaleDatePlaceholder()}
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
                <Text style={styles.saveBtnText}>{t('profile.saveChanges')}</Text>
              )}
            </Pressable>
          )}

          <Text style={styles.sectionHeader}>{t('profile.security')}</Text>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>{t('profile.changePassword')}</Text>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder={t('profile.currentPassword')}
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              value={changeNewPassword}
              onChangeText={setChangeNewPassword}
              placeholder={t('auth.newPassword')}
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
            />
            <PasswordStrengthMeter
              password={changeNewPassword}
              context={{ email, firstName, lastName }}
            />
            <TextInput
              style={styles.input}
              value={changeConfirmPassword}
              onChangeText={setChangeConfirmPassword}
              placeholder={t('profile.confirmNewPassword')}
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
                : <Text style={styles.saveBtnText}>{t('profile.changePassword')}</Text>}
            </Pressable>
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
  readonlyField: { justifyContent: 'center' },
  readonlyText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  errorText: { color: Colors.dangerText, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  saveBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.textDark },
});
