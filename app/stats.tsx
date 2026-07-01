import React from 'react';
import { View, Text, StyleSheet, Platform, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@shared/hooks/useAuth';
import Colors from '@/shared/constants/colors';
import { t } from '@/shared/i18n';
import { getApiUrl } from '@/shared/query-client';
import { useLanguage } from '@shared/hooks/useLanguage';
import type { GameHistory } from '@/shared/lib/schema';

interface StatsData {
  wins: number;
  losses: number;
  avgScore: number;
  recent: GameHistory[];
}

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const { getToken } = useAuth();
  useLanguage();

  const { data, isLoading, error } = useQuery<StatsData>({
    queryKey: ['stats'],
    queryFn: async () => {
      const token = await getToken();
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load stats');
      return res.json();
    },
  });

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
        <Text style={styles.title}>{t('stats.title')}</Text>
      </View>

      {isLoading && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      )}

      {error && (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={Colors.danger} />
          <Text style={styles.errorText}>{String(error)}</Text>
        </View>
      )}

      {data && (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Summary row */}
          <View style={styles.summaryRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{data.wins}</Text>
              <Text style={styles.statLabel}>{t('stats.wins')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{data.losses}</Text>
              <Text style={styles.statLabel}>{t('stats.losses')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{data.avgScore}</Text>
              <Text style={styles.statLabel}>{t('stats.avgScore')}</Text>
            </View>
          </View>

          {/* Recent games */}
          <Text style={styles.sectionHeader}>{t('stats.recentGames')}</Text>

          {data.recent.length === 0 ? (
            <Text style={styles.emptyText}>{t('stats.noGames')}</Text>
          ) : (
            data.recent.map((game) => (
              <View key={String(game.id)} style={styles.gameRow}>
                <View style={[styles.resultBadge, game.result === 'win' ? styles.winBadge : styles.lossBadge]}>
                  <Text style={styles.resultText}>
                    {game.result === 'win' ? t('stats.win') : t('stats.loss')}
                  </Text>
                </View>
                <View style={styles.gameInfo}>
                  <Text style={styles.gameScore}>{game.score} – {game.opponentScore}</Text>
                  <Text style={styles.gameMeta}>
                    {game.mode === 'ai' && game.aiDifficulty ? `AI · ${game.aiDifficulty}` : 'Online'}
                  </Text>
                </View>
                <Text style={styles.gameDate}>
                  {game.playedAt ? new Date(game.playedAt).toLocaleDateString() : ''}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: -8 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.gold },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText: { color: Colors.danger, fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: Colors.whiteAlpha, borderRadius: 14,
    paddingVertical: 20, alignItems: 'center', gap: 4,
  },
  statValue: { fontSize: 32, fontFamily: 'Inter_700Bold', color: Colors.gold },
  statLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  sectionHeader: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },
  emptyText: { color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 20 },
  gameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.whiteAlpha, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  resultBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  winBadge: { backgroundColor: 'rgba(46, 125, 50, 0.4)' },
  lossBadge: { backgroundColor: 'rgba(198, 40, 40, 0.3)' },
  resultText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.white },
  gameInfo: { flex: 1 },
  gameScore: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.white },
  gameMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  gameDate: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
});
