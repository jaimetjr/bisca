import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/shared/constants/colors';
import { t } from '@/shared/i18n';
import { PLAYER_NAME_MAX_LENGTH } from '@/shared/constants/game';
import { useSettings } from '@/shared/hooks/useSettings';
import { useAuth } from '@shared/hooks/useAuth';
import { useGuestMode } from '@shared/hooks/useGuestMode';
import { useLanguage } from '@shared/hooks/useLanguage';
import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '@/shared/query-client';

type OnlineMode = 'create' | 'browse' | 'join';

const TAB_ICONS: Record<OnlineMode, { default: string; active: string }> = {
  create: { default: 'plus-circle-outline', active: 'plus-circle' },
  browse: { default: 'cards-outline', active: 'cards' },
  join:   { default: 'account-arrow-right-outline', active: 'account-arrow-right' },
};

export default function SetupScreen() {
  const { mode, roomCode: invitedRoomCode } = useLocalSearchParams<{ mode: string; roomCode?: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const isOnline = mode === 'online';

  const { getToken, isSignedIn } = useAuth();
  const { isGuest } = useGuestMode();
  useLanguage();
  const isLoggedIn = !!isSignedIn && !isGuest;

  const { settings } = useSettings();
  const [playerCount, setPlayerCount] = useState(2);
  const [playerName, setPlayerName] = useState('');
  // Arriving via a shared invite link (app/join.tsx) preselects the join tab
  // with the room code filled in — the recipient only enters a name.
  const [roomCode, setRoomCode] = useState(invitedRoomCode ?? '');
  const [onlineMode, setOnlineMode] = useState<OnlineMode>(invitedRoomCode ? 'join' : 'create');
  const [isPublic, setIsPublic] = useState(true);

  const { data: profile } = useQuery<{ firstName: string; lastName: string }>({
    queryKey: ['profile'],
    enabled: isLoggedIn,
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${getApiUrl()}api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json();
    },
  });

  // The server rejects player names over PLAYER_NAME_MAX_LENGTH (join/create
  // fail with INVALID_MESSAGE). The guest input enforces it via maxLength, but
  // profile-derived full names have no such bound — clamp before sending.
  const rawName = isLoggedIn
    ? `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim()
    : playerName.trim();
  const resolvedName = rawName.slice(0, PLAYER_NAME_MAX_LENGTH).trim() || t('setup.defaultName');

  const handleStart = () => {
    if (isOnline) {
      if (onlineMode === 'create') {
        router.push({
          pathname: '/online-lobby',
          params: { action: 'create', playerCount: String(playerCount), playerName: resolvedName, isPublic: isPublic ? '1' : '0' },
        });
      } else {
        router.push({
          pathname: '/online-lobby',
          params: { action: 'join', roomCode, playerName: resolvedName },
        });
      }
    } else {
      router.push({
        pathname: '/game',
        params: { mode: 'ai', playerCount: String(playerCount), playerName: resolvedName, difficulty: settings.aiDifficulty },
      });
    }
  };

  const handleTabPress = (m: OnlineMode) => {
    if (m === 'browse') {
      router.push({ pathname: '/lobby-browser', params: { playerName: resolvedName } });
    } else {
      setOnlineMode(m);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 20 }]}>
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      <Pressable style={styles.backButton} onPress={() => router.back()} testID="back-btn">
        <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.white} />
      </Pressable>

      <Text style={styles.title}>{isOnline ? t('setup.onlineTitle') : t('setup.aiTitle')}</Text>
      <Text style={styles.subtitle}>
        {isOnline ? t('setup.onlineSubtitle') : t('setup.aiSubtitle')}
      </Text>

      {isLoggedIn ? (
        <View style={styles.section}>
          <Text style={styles.label}>{t('setup.yourName')}</Text>
          <View style={styles.nameDisplay}>
            <MaterialCommunityIcons name="account-circle" size={20} color={Colors.gold} />
            <Text style={styles.nameDisplayText}>
              {resolvedName}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.label}>{t('setup.yourName')}</Text>
          <TextInput
            style={styles.input}
            value={playerName}
            onChangeText={setPlayerName}
            placeholder={t('setup.enterName')}
            placeholderTextColor={Colors.textSecondary}
            maxLength={PLAYER_NAME_MAX_LENGTH}
            testID="name-input"
          />
        </View>
      )}

      {isOnline && (
        <>
          {/* Tab row */}
          <View style={styles.tabContainer}>
            {(['create', 'browse', 'join'] as OnlineMode[]).map((m) => {
              const isActive = onlineMode === m;
              const icons = TAB_ICONS[m];
              return (
                <Pressable
                  key={m}
                  style={[styles.tabButton, isActive && styles.tabActive]}
                  onPress={() => handleTabPress(m)}
                >
                  <MaterialCommunityIcons
                    name={(isActive ? icons.active : icons.default) as any}
                    size={15}
                    color={isActive ? Colors.textDark : Colors.textSecondary}
                  />
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                    {m === 'create' ? t('setup.createRoom') : m === 'browse' ? t('setup.browseRooms') : t('setup.joinRoom')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Content panel */}
          <View style={styles.onlinePanelCard}>
            {onlineMode === 'create' && (
              <>
                <View>
                  <Text style={styles.label}>{t('setup.gameMode')}</Text>
                  <View style={styles.playerCountRow}>
                    {([{ count: 2, label: '1v1' }, { count: 4, label: '2v2' }] as const).map(({ count, label }) => (
                      <Pressable
                        key={count}
                        style={[styles.countButton, playerCount === count && styles.countButtonActive]}
                        onPress={() => setPlayerCount(count)}
                        testID={`count-${count}-btn`}
                      >
                        <Text style={[styles.countText, playerCount === count && styles.countTextActive]}>
                          {label}
                        </Text>
                        <Text style={[styles.countLabel, playerCount === count && styles.countLabelActive]}>
                          {t('setup.players', { count })}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View>
                  <Text style={styles.label}>{t('setup.visibility')}</Text>
                  <View style={styles.toggleContainer}>
                    <Pressable
                      style={[styles.toggleButton, isPublic && styles.toggleActive]}
                      onPress={() => setIsPublic(true)}
                    >
                      <MaterialCommunityIcons name="earth" size={14} color={isPublic ? Colors.textDark : Colors.textSecondary} />
                      <Text style={[styles.toggleText, isPublic && styles.toggleTextActive]}>{t('setup.public')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.toggleButton, !isPublic && styles.toggleActive]}
                      onPress={() => setIsPublic(false)}
                    >
                      <MaterialCommunityIcons name="lock" size={14} color={!isPublic ? Colors.textDark : Colors.textSecondary} />
                      <Text style={[styles.toggleText, !isPublic && styles.toggleTextActive]}>{t('setup.private')}</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.hintText}>{t(isPublic ? 'setup.publicHint' : 'setup.privateHint')}</Text>
                </View>
              </>
            )}

            {onlineMode === 'join' && (
              <View>
                <Text style={styles.label}>{t('setup.roomCode')}</Text>
                <TextInput
                  style={styles.roomCodeInput}
                  value={roomCode}
                  onChangeText={(txt) => setRoomCode(txt.toUpperCase())}
                  placeholder={t('setup.enterRoomCode')}
                  placeholderTextColor={Colors.textSecondary}
                  maxLength={6}
                  autoCapitalize="characters"
                  testID="room-code-input"
                />
                <View style={styles.roomCodeMeta}>
                  <Text style={styles.roomCodeCount}>{roomCode.length}/5</Text>
                </View>
              </View>
            )}
          </View>
        </>
      )}

      {!isOnline && (
        <>
          <View style={styles.section}>
            <Text style={styles.label}>{t('setup.gameMode')}</Text>
            <View style={styles.playerCountRow}>
              {([{ count: 2, label: '1v1' }, { count: 4, label: '2v2' }] as const).map(({ count, label }) => (
                <Pressable
                  key={count}
                  style={[styles.countButton, playerCount === count && styles.countButtonActive]}
                  onPress={() => setPlayerCount(count)}
                  testID={`count-${count}-btn`}
                >
                  <Text style={[styles.countText, playerCount === count && styles.countTextActive]}>
                    {label}
                  </Text>
                  <Text style={[styles.countLabel, playerCount === count && styles.countLabelActive]}>
                    {count === 2 ? t('setup.youVsAI') : t('setup.youAIvsAI')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="robot" size={20} color={Colors.gold} />
            <Text style={styles.infoText}>{t('setup.aiInfo')}</Text>
          </View>
        </>
      )}

      <View style={{ flex: 1 }} />

      <Pressable
        style={({ pressed }) => [
          styles.startButton,
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          (isOnline && onlineMode === 'join' && roomCode.length < 4) && styles.startButtonDisabled,
        ]}
        onPress={handleStart}
        disabled={isOnline && onlineMode === 'join' && roomCode.length < 4}
        testID="start-btn"
      >
        <MaterialCommunityIcons
          name={
            !isOnline ? 'sword-cross'
            : onlineMode === 'create' ? 'plus-circle'
            : 'account-arrow-right'
          }
          size={22}
          color={Colors.textDark}
        />
        <Text style={styles.startButtonText}>
          {!isOnline ? t('setup.startGame')
            : onlineMode === 'create' ? t('setup.createRoom')
            : t('setup.joinRoom')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    color: Colors.gold,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginBottom: 28,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: Colors.white,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha,
  },
  nameDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  nameDisplayText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.white,
  },
  // Tab row
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    gap: 5,
    backgroundColor: Colors.whiteAlpha2,
  },
  tabActive: {
    backgroundColor: Colors.gold,
  },
  tabText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.textDark,
  },
  // Content panel
  onlinePanelCard: {
    backgroundColor: Colors.whiteAlpha2,
    borderRadius: 16,
    padding: 20,
    gap: 20,
    marginBottom: 16,
  },
  roomCodeInput: {
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha,
    letterSpacing: 8,
    textAlign: 'center',
  },
  roomCodeMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  roomCodeCount: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  // Visibility toggle (inside panel)
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 10,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    gap: 6,
  },
  toggleActive: {
    backgroundColor: Colors.gold,
  },
  toggleText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: Colors.textDark,
  },
  playerCountRow: {
    flexDirection: 'row',
    gap: 12,
  },
  countButton: {
    flex: 1,
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  countButtonActive: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212, 168, 67, 0.15)',
  },
  countText: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.textSecondary,
  },
  countTextActive: {
    color: Colors.gold,
  },
  countLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  countLabelActive: {
    color: Colors.gold,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: Colors.whiteAlpha2,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  startButton: {
    flexDirection: 'row',
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  hintText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 6,
  },
  startButtonText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.textDark,
  },
});
