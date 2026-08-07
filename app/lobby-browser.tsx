import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Colors from '@/shared/constants/colors';
import { useContentPadding } from '@shared/hooks/useContentPadding';
import { t } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';
import type { PublicRoomInfo } from '@/shared/lib/types/messages';

type ModeFilter = 'all' | '1v1' | '2v2';

function RoomListItem({ room, onPress }: { room: PublicRoomInfo; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.roomItem, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <MaterialCommunityIcons name="crown" size={20} color={Colors.gold} />
      <View style={styles.roomInfo}>
        <Text style={styles.roomHost}>{room.hostName}</Text>
        <Text style={styles.roomPlayers}>
          {room.currentPlayers}/{room.maxPlayers} {t('browser.players')}
        </Text>
      </View>
      <View style={styles.modeBadge}>
        <Text style={styles.modeBadgeText}>{room.mode}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
    </Pressable>
  );
}

function EmptyState({ playerName }: { playerName: string }) {
  return (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="cards-outline" size={48} color={Colors.textSecondary} />
      <Text style={styles.emptyTitle}>{t('browser.emptyTitle')}</Text>
      <Text style={styles.emptySubtitle}>{t('browser.emptySubtitle')}</Text>
      <Pressable
        style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.8 }]}
        onPress={() => router.replace({ pathname: '/setup', params: { mode: 'online' } } as never)}
      >
        <MaterialCommunityIcons name="plus" size={18} color={Colors.textDark} />
        <Text style={styles.createBtnText}>{t('browser.createOne')}</Text>
      </Pressable>
    </View>
  );
}

export default function LobbyBrowserScreen() {
  const { playerName } = useLocalSearchParams<{ playerName: string }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const contentPadding = useContentPadding(24);
  useLanguage();

  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const queryClient = useQueryClient();

  const { data: rooms = [], isLoading, isRefetching } = useQuery<PublicRoomInfo[]>({
    queryKey: ['api', 'rooms'],
    staleTime: 0,
    refetchInterval: 5000,
  });

  const filtered = rooms.filter(r => modeFilter === 'all' || r.mode === modeFilter);

  const joinRoom = (code: string) => {
    router.push({
      pathname: '/online-lobby',
      params: { action: 'join', roomCode: code, playerName },
    });
  };

  const quickJoin = () => {
    if (!filtered.length) return;
    const room = filtered[Math.floor(Math.random() * filtered.length)];
    joinRoom(room.code);
  };

  return (
    <View style={[styles.container, { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 20, paddingHorizontal: contentPadding }]}>
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.white} />
      </Pressable>

      <Text style={styles.title}>{t('browser.title')}</Text>
      <Text style={styles.subtitle}>{t('browser.subtitle')}</Text>

      {/* Filter + Quick Join row */}
      <View style={styles.filterRow}>
        {(['all', '1v1', '2v2'] as ModeFilter[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, modeFilter === f && styles.filterChipActive]}
            onPress={() => setModeFilter(f)}
          >
            <Text style={[styles.filterChipText, modeFilter === f && styles.filterChipTextActive]}>
              {f === 'all' ? t('browser.filterAll') : f}
            </Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable
          style={({ pressed }) => [
            styles.quickJoinBtn,
            pressed && { opacity: 0.8 },
            !filtered.length && styles.quickJoinDisabled,
          ]}
          onPress={quickJoin}
          disabled={!filtered.length}
        >
          <MaterialCommunityIcons name="shuffle" size={16} color={filtered.length ? Colors.textDark : Colors.textSecondary} />
          <Text style={[styles.quickJoinText, !filtered.length && { color: Colors.textSecondary }]}>
            {t('browser.quickJoin')}
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: ['api', 'rooms'] })}
              tintColor={Colors.gold}
              colors={[Colors.gold]}
            />
          }
          renderItem={({ item }) => (
            <RoomListItem room={item} onPress={() => joinRoom(item.code)} />
          )}
          ListEmptyComponent={<EmptyState playerName={playerName} />}
        />
      )}
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
    marginBottom: 20,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.whiteAlpha,
  },
  filterChipActive: {
    backgroundColor: Colors.gold,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.textDark,
  },
  quickJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.gold,
  },
  quickJoinDisabled: {
    backgroundColor: Colors.whiteAlpha,
  },
  quickJoinText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textDark,
  },
  listContent: {
    gap: 10,
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha,
  },
  roomInfo: {
    flex: 1,
  },
  roomHost: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.white,
  },
  roomPlayers: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: Colors.whiteAlpha,
  },
  modeBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  createBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textDark,
  },
});
