import React from 'react';
import { View, Text, StyleSheet, Platform, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@shared/hooks/useAuth';
import Colors from '@/shared/constants/colors';
import { useContentPadding } from '@shared/hooks/useContentPadding';
import { t, tOr } from '@/shared/i18n';
import { getApiUrl } from '@/shared/query-client';
import { useLanguage } from '@shared/hooks/useLanguage';

interface AchievementRow {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  unlocked: boolean;
}

interface AchievementsResponse {
  achievements: AchievementRow[];
  totalXp: number;
  unlockedCount: number;
  totalCount: number;
}

export default function AchievementsScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const contentPadding = useContentPadding(24);
  const { getToken } = useAuth();
  useLanguage();

  const { data, isLoading, error } = useQuery<AchievementsResponse>({
    queryKey: ['achievements'],
    queryFn: async () => {
      const token = await getToken();
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/achievements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('load failed');
      return res.json();
    },
  });

  return (
    <View style={[styles.container, { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 20, paddingHorizontal: contentPadding }]}>
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.white} />
        </Pressable>
        <Text style={styles.title}>{t('achievements.title')}</Text>
      </View>

      {isLoading && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      )}

      {error && !isLoading && (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={Colors.danger} />
          <Text style={styles.errorText}>{t('achievements.loadError')}</Text>
        </View>
      )}

      {data && (
        <>
          <View style={styles.summaryCard}>
            <MaterialCommunityIcons name="trophy" size={28} color={Colors.gold} />
            <Text style={styles.summaryText}>
              {t('achievements.summary', {
                unlocked: data.unlockedCount,
                total: data.totalCount,
                xp: data.totalXp,
              })}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {data.achievements.length === 0 ? (
              <Text style={styles.emptyText}>{t('achievements.empty')}</Text>
            ) : (
              data.achievements.map((a) => (
                <View
                  key={a.id}
                  style={[styles.row, a.unlocked ? styles.rowUnlocked : styles.rowLocked]}
                >
                  <View style={[styles.iconWrap, a.unlocked && styles.iconWrapUnlocked]}>
                    <MaterialCommunityIcons
                      name={a.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                      size={24}
                      color={a.unlocked ? Colors.textDark : Colors.textSecondary}
                    />
                  </View>
                  <View style={styles.body}>
                    <Text style={[styles.rowTitle, !a.unlocked && styles.rowTitleLocked]}>
                      {tOr(`achievement.${a.id}.title`, a.title)}
                    </Text>
                    <Text style={styles.rowDesc}>
                      {tOr(`achievement.${a.id}.desc`, a.description)}
                    </Text>
                  </View>
                  <View style={styles.xpBadge}>
                    <Text style={styles.xpText}>{`+${a.xp}`}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: -8 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.gold },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText: { color: Colors.danger, fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.whiteAlpha2, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.gold, marginBottom: 16,
  },
  summaryText: { flex: 1, color: Colors.white, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  rowLocked: { backgroundColor: Colors.whiteAlpha, opacity: 0.65 },
  rowUnlocked: { backgroundColor: Colors.whiteAlpha2, borderWidth: 1, borderColor: Colors.gold },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  iconWrapUnlocked: { backgroundColor: Colors.gold },
  body: { flex: 1 },
  rowTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.white },
  rowTitleLocked: { color: Colors.textSecondary },
  rowDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 },
  xpBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    minWidth: 40, alignItems: 'center',
  },
  xpText: { color: Colors.gold, fontSize: 12, fontFamily: 'Inter_700Bold' },
  emptyText: {
    color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter_400Regular',
    textAlign: 'center', marginTop: 40,
  },
});
