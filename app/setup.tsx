import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/shared/constants/colors';
import { t } from '@/shared/i18n';
import { PLAYER_NAME_MAX_LENGTH } from '@/shared/constants/game';
import type { AIDifficulty } from '@/shared/lib/types';
import { useSettings } from '@/shared/hooks/useSettings';

export default function SetupScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const isOnline = mode === 'online';

  const { settings } = useSettings();
  const [playerCount, setPlayerCount] = useState(2);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(true);
  const [difficulty, setDifficulty] = useState<AIDifficulty>(settings.aiDifficulty);

  const handleStart = () => {
    const name = playerName.trim() || t('setup.defaultName');
    if (isOnline) {
      if (isCreating) {
        router.push({
          pathname: '/online-lobby',
          params: { action: 'create', playerCount: String(playerCount), playerName: name },
        });
      } else {
        router.push({
          pathname: '/online-lobby',
          params: { action: 'join', roomCode, playerName: name },
        });
      }
    } else {
      router.push({
        pathname: '/game',
        params: { mode: 'ai', playerCount: String(playerCount), playerName: name, difficulty },
      });
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

      {isOnline && (
        <View style={styles.toggleContainer}>
          <Pressable
            style={[styles.toggleButton, isCreating && styles.toggleActive]}
            onPress={() => setIsCreating(true)}
          >
            <Text style={[styles.toggleText, isCreating && styles.toggleTextActive]}>{t('setup.createRoom')}</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, !isCreating && styles.toggleActive]}
            onPress={() => setIsCreating(false)}
          >
            <Text style={[styles.toggleText, !isCreating && styles.toggleTextActive]}>{t('setup.joinRoom')}</Text>
          </Pressable>
        </View>
      )}

      {isOnline && !isCreating ? (
        <View style={styles.section}>
          <Text style={styles.label}>{t('setup.roomCode')}</Text>
          <TextInput
            style={styles.input}
            value={roomCode}
            onChangeText={(txt) => setRoomCode(txt.toUpperCase())}
            placeholder={t('setup.enterRoomCode')}
            placeholderTextColor={Colors.textSecondary}
            maxLength={6}
            autoCapitalize="characters"
            testID="room-code-input"
          />
        </View>
      ) : (
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
                  {isOnline ? t('setup.players', { count }) : count === 2 ? t('setup.youVsAI') : t('setup.youAIvsAI')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!isOnline && (
        <>
          <View style={styles.section}>
            <Text style={styles.label}>{t('setup.difficulty')}</Text>
            <View style={styles.toggleContainer}>
              {(['easy', 'medium', 'hard'] as AIDifficulty[]).map((d) => (
                <Pressable
                  key={d}
                  style={[styles.toggleButton, difficulty === d && styles.toggleActive]}
                  onPress={() => setDifficulty(d)}
                  testID={`difficulty-${d}-btn`}
                >
                  <Text style={[styles.toggleText, difficulty === d && styles.toggleTextActive]}>
                    {t(`setup.difficulty.${d}`)}
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
          (isOnline && !isCreating && roomCode.length < 4) && styles.startButtonDisabled,
        ]}
        onPress={handleStart}
        disabled={isOnline && !isCreating && roomCode.length < 4}
        testID="start-btn"
      >
        <MaterialCommunityIcons
          name={isOnline ? 'play-circle' : 'sword-cross'}
          size={22}
          color={Colors.textDark}
        />
        <Text style={styles.startButtonText}>
          {isOnline ? (isCreating ? t('setup.createRoom') : t('setup.joinRoom')) : t('setup.startGame')}
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
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.whiteAlpha2,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
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
  startButtonText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.textDark,
  },
});
