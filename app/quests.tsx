import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@shared/hooks/useAuth';
import Colors from '@/shared/constants/colors';
import { useContentPadding } from '@shared/hooks/useContentPadding';
import { t, tOr } from '@/shared/i18n';
import { getApiUrl } from '@/shared/query-client';
import { useLanguage } from '@shared/hooks/useLanguage';

interface QuestRow {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  target: number;
  progress: number;
  claimed: boolean;
  claimable: boolean;
}

interface QuestsResponse {
  date: string;
  quests: QuestRow[];
}

export default function QuestsScreen() {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const contentPadding = useContentPadding(24);
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState('');
  useLanguage();

  const { data, isLoading, error } = useQuery<QuestsResponse>({
    queryKey: ['quests', 'today'],
    queryFn: async () => {
      const token = await getToken();
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/quests/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('load failed');
      return res.json();
    },
  });

  const claim = useMutation({
    mutationFn: async (questId: string) => {
      const token = await getToken();
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/quests/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ questId }),
      });
      if (!res.ok) throw new Error('claim failed');
      return res.json();
    },
    onSuccess: () => {
      setErrorMsg('');
      queryClient.invalidateQueries({ queryKey: ['quests', 'today'] });
      queryClient.invalidateQueries({ queryKey: ['achievements'] });
    },
    onError: () => {
      setErrorMsg(t('quests.claimError'));
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
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('quests.title')}</Text>
          <Text style={styles.subtitle}>{t('quests.subtitle')}</Text>
        </View>
      </View>

      {isLoading && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      )}

      {error && !isLoading && (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={Colors.danger} />
          <Text style={styles.errorText}>{t('quests.loadError')}</Text>
        </View>
      )}

      {errorMsg !== '' && (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert" size={16} color={Colors.danger} />
          <Text style={styles.errorBannerText}>{errorMsg}</Text>
        </View>
      )}

      {data && (
        <ScrollView showsVerticalScrollIndicator={false}>
          {data.quests.length === 0 ? (
            <Text style={styles.emptyText}>{t('quests.empty')}</Text>
          ) : (
            data.quests.map((q) => {
              const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
              const status = q.claimed
                ? t('quests.claimed')
                : q.claimable
                  ? t('quests.claim')
                  : t('quests.inProgress');
              return (
                <View key={q.id} style={styles.questCard}>
                  <View style={styles.questHeader}>
                    <MaterialCommunityIcons
                      name={q.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                      size={22}
                      color={Colors.gold}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.questTitle}>{tOr(`quest.${q.id}.title`, q.title)}</Text>
                      <Text style={styles.questDesc}>{tOr(`quest.${q.id}.desc`, q.description)}</Text>
                    </View>
                    <Text style={styles.questXp}>{t('quests.xpReward', { xp: q.xp })}</Text>
                  </View>

                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                  <View style={styles.progressFooter}>
                    <Text style={styles.progressText}>
                      {t('quests.progress', { progress: q.progress, target: q.target })}
                    </Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.claimBtn,
                        q.claimed && styles.claimBtnClaimed,
                        !q.claimable && !q.claimed && styles.claimBtnDisabled,
                        pressed && q.claimable && { opacity: 0.85 },
                      ]}
                      disabled={!q.claimable || claim.isPending}
                      onPress={() => claim.mutate(q.id)}
                      testID={`claim-${q.id}`}
                    >
                      <Text
                        style={[
                          styles.claimBtnText,
                          q.claimed && styles.claimBtnTextClaimed,
                          !q.claimable && !q.claimed && styles.claimBtnTextDisabled,
                        ]}
                      >
                        {status}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: -8 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.gold },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText: { color: Colors.danger, fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(198, 40, 40, 0.15)',
    borderColor: Colors.danger, borderWidth: 1,
    borderRadius: 10, padding: 10, marginBottom: 12,
  },
  errorBannerText: { color: Colors.danger, fontSize: 12, fontFamily: 'Inter_500Medium' },
  emptyText: {
    color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter_400Regular',
    textAlign: 'center', marginTop: 40,
  },
  questCard: {
    backgroundColor: Colors.whiteAlpha2, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.whiteAlpha, marginBottom: 12,
  },
  questHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  questTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.white },
  questDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 },
  questXp: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.gold },
  progressTrack: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3, overflow: 'hidden', marginBottom: 8,
  },
  progressFill: { height: '100%', backgroundColor: Colors.gold },
  progressFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  claimBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: Colors.gold,
  },
  claimBtnClaimed: { backgroundColor: 'rgba(46, 125, 50, 0.4)' },
  claimBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  claimBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textDark },
  claimBtnTextClaimed: { color: Colors.white },
  claimBtnTextDisabled: { color: Colors.textSecondary },
});
