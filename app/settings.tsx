import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/shared/constants/colors';
import { t, SUPPORTED_LANGUAGE_CODES } from '@/shared/i18n';
import { useSettings, AppSettings } from '@/shared/hooks/useSettings';
import { useLanguage } from '@shared/hooks/useLanguage';
import type { AIDifficulty } from '@/shared/lib/types';
import { useAuth } from '@clerk/clerk-expo';
import { useGuestMode } from '@shared/hooks/useGuestMode';

const DIFFICULTY_OPTIONS: AIDifficulty[] = ['easy', 'medium', 'hard'];
const SPEED_OPTIONS: AppSettings['gameSpeed'][] = ['slow', 'normal', 'fast'];

// Display names for each language code
const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English', es: 'Español', fr: 'Français', pt: 'Português',
  it: 'Italiano', de: 'Deutsch', ja: '日本語', zh: '中文',
  ko: '한국어', ar: 'العربية', ru: 'Русский', nl: 'Nederlands',
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const { settings, updateSettings } = useSettings();
  const { changeLanguage } = useLanguage();
  const { signOut } = useAuth();
  const { isGuest, disableGuestMode } = useGuestMode();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    Alert.alert(
      isGuest ? 'Leave Guest Mode' : 'Sign Out',
      isGuest
        ? 'You will be taken back to the login screen.'
        : 'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isGuest ? 'Leave' : 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try {
              if (isGuest) {
                await disableGuestMode();
              } else {
                await signOut();
              }
              router.replace('/(auth)/login');
            } finally {
              setSigningOut(false);
            }
          },
        },
      ]
    );
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
        <Text style={styles.title}>{t('settings.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Gameplay */}
        <Text style={styles.sectionHeader}>{t('settings.gameplay')}</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('setup.difficulty')}</Text>
          <View style={styles.segmentedRow}>
            {DIFFICULTY_OPTIONS.map((d) => (
              <Pressable
                key={d}
                style={[styles.segment, settings.aiDifficulty === d && styles.segmentActive]}
                onPress={() => updateSettings({ aiDifficulty: d })}
              >
                <Text style={[styles.segmentText, settings.aiDifficulty === d && styles.segmentTextActive]}>
                  {t(`setup.difficulty.${d}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('settings.gameSpeed')}</Text>
          <View style={styles.segmentedRow}>
            {SPEED_OPTIONS.map((s) => (
              <Pressable
                key={s}
                style={[styles.segment, settings.gameSpeed === s && styles.segmentActive]}
                onPress={() => updateSettings({ gameSpeed: s })}
              >
                <Text style={[styles.segmentText, settings.gameSpeed === s && styles.segmentTextActive]}>
                  {t(`settings.gameSpeed.${s}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Language */}
        <Text style={styles.sectionHeader}>{t('settings.language')}</Text>

        <View style={styles.card}>
          <View style={styles.languageGrid}>
            {SUPPORTED_LANGUAGE_CODES.map((code) => (
              <Pressable
                key={code}
                style={[styles.languageChip, settings.language === code && styles.languageChipActive]}
                onPress={() => { updateSettings({ language: code }); changeLanguage(code); }}
              >
                <Text style={[styles.languageChipText, settings.language === code && styles.languageChipTextActive]}>
                  {LANGUAGE_LABELS[code] ?? code.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Account */}
        <Text style={styles.sectionHeader}>{t('settings.account')}</Text>

        {!isGuest && (
          <Pressable
            style={({ pressed }) => [styles.accountBtn, pressed && { opacity: 0.75 }]}
            onPress={() => router.push('/profile')}
          >
            <MaterialCommunityIcons name="account-edit-outline" size={18} color={Colors.white} />
            <Text style={styles.accountBtnText}>{t('settings.editProfile')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} style={{ marginLeft: 'auto' }} />
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.75 }, signingOut && { opacity: 0.5 }]}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          <MaterialCommunityIcons name="logout" size={18} color={Colors.danger} />
          <Text style={styles.signOutText}>
            {isGuest ? t('settings.leaveGuestMode') : t('settings.signOut')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: -8 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.gold },
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
    gap: 12,
  },
  cardLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.white },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: Colors.whiteAlpha2,
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: { backgroundColor: Colors.gold },
  segmentText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  segmentTextActive: { color: Colors.textDark },
  languageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  languageChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.whiteAlpha2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  languageChipActive: { borderColor: Colors.gold, backgroundColor: 'rgba(212, 168, 67, 0.15)' },
  languageChipText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  languageChipTextActive: { color: Colors.gold },
  accountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  accountBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.white },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(198, 40, 40, 0.12)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
  },
  signOutText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.danger },
});
