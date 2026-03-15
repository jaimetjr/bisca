import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/shared/constants/colors';
import { t } from '@/shared/i18n';
import { getApiUrl } from '@/shared/query-client';
import { CONNECTION_TIMEOUT_MS } from '@/shared/constants/game';
import type { ServerMessage, ClientMessage } from '@/shared/lib/types/messages';

export default function OnlineLobbyScreen() {
  const params = useLocalSearchParams<{
    action: string;
    playerCount?: string;
    playerName: string;
    roomCode?: string;
  }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;

  const [roomId, setRoomId] = useState(params.roomCode || '');
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [maxPlayers, setMaxPlayers] = useState(parseInt(params.playerCount || '2', 10));
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'starting' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [myId, setMyId] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const gameStartedRef = useRef(false);
  const myIdRef = useRef('');
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectWebSocket = useCallback(() => {
    try {
      const baseUrl = getApiUrl();
      const wsUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Timeout if connection never establishes
      connectionTimeoutRef.current = setTimeout(() => {
        ws.close();
        setErrorMsg(t('lobby.connectionFailed'));
        setStatus('error');
      }, CONNECTION_TIMEOUT_MS);

      ws.onopen = () => {
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        const msg: ClientMessage = params.action === 'create'
          ? { type: 'create_room', playerName: params.playerName, maxPlayers: parseInt(params.playerCount || '2', 10) }
          : { type: 'join_room', roomCode: params.roomCode || '', playerName: params.playerName };
        ws.send(JSON.stringify(msg));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerMessage;
          switch (data.type) {
            case 'room_created':
            case 'room_joined':
              setRoomId(data.roomCode);
              setMyId(data.playerId);
              myIdRef.current = data.playerId;
              setPlayers(data.players);
              setMaxPlayers(data.maxPlayers);
              setStatus('waiting');
              break;
            case 'player_joined':
            case 'player_left':
              setPlayers(data.players);
              break;
            case 'game_start':
              if (!gameStartedRef.current) {
                gameStartedRef.current = true;
                setStatus('starting');
                if (Platform.OS !== 'web') {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
                ws.onclose = null;
                ws.close();
                router.replace({
                  pathname: '/game',
                  params: {
                    mode: 'online',
                    playerCount: String(data.gameState.players.length),
                    playerName: params.playerName,
                    initialState: JSON.stringify(data.gameState),
                    myPlayerId: data.playerId || myIdRef.current,
                  },
                });
              }
              break;
            case 'error':
              setErrorMsg(data.message);
              setStatus('error');
              break;
          }
        } catch {
          setErrorMsg(t('game.syncError'));
          setStatus('error');
        }
      };

      ws.onerror = () => {
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        if (!gameStartedRef.current) {
          setErrorMsg(t('lobby.connectionFailed'));
          setStatus('error');
        }
      };

      ws.onclose = () => {
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        if (!gameStartedRef.current) {
          setErrorMsg(t('lobby.disconnected'));
          setStatus('error');
        }
      };
    } catch {
      setErrorMsg(t('lobby.cannotConnect'));
      setStatus('error');
    }
  }, [params]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const handleStartGame = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN && players.length >= 2) {
      wsRef.current.send(JSON.stringify({ type: 'start_game' } satisfies ClientMessage));
    }
  };

  const isHost = params.action === 'create';
  const canStart = isHost && players.length >= 2;

  return (
    <View style={[styles.container, { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 20 }]}>
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      <Pressable style={styles.backButton} onPress={() => {
        if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
        router.back();
      }}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.white} />
      </Pressable>

      <Text style={styles.title}>
        {status === 'connecting' ? t('lobby.connecting') : status === 'error' ? t('lobby.error') : t('lobby.title')}
      </Text>

      {status === 'connecting' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={styles.statusText}>{t('lobby.settingUp')}</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={Colors.danger} />
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
            onPress={() => {
              setStatus('connecting');
              setErrorMsg('');
              gameStartedRef.current = false;
              connectWebSocket();
            }}
          >
            <Text style={styles.retryText}>{t('lobby.tryAgain')}</Text>
          </Pressable>
        </View>
      )}

      {status === 'waiting' && (
        <>
          <View style={styles.roomCodeCard}>
            <Text style={styles.roomCodeLabel}>{t('lobby.roomCode')}</Text>
            <Text style={styles.roomCode}>{roomId}</Text>
            <Text style={styles.roomCodeHint}>{t('lobby.shareCode')}</Text>
          </View>

          <View style={styles.playersSection}>
            <Text style={styles.sectionLabel}>
              {t('lobby.players', { current: players.length, max: maxPlayers })}
            </Text>
            {players.map((p, i) => (
              <View key={p.id} style={styles.playerRow}>
                <View style={styles.playerAvatar}>
                  <MaterialCommunityIcons
                    name={i === 0 ? 'crown' : 'account'}
                    size={18}
                    color={i === 0 ? Colors.gold : Colors.textSecondary}
                  />
                </View>
                <Text style={styles.playerName}>{p.name}</Text>
                {p.id === myId && (
                  <View style={styles.youBadge}>
                    <Text style={styles.youText}>{t('lobby.you')}</Text>
                  </View>
                )}
                {i === 0 && (
                  <View style={styles.hostBadge}>
                    <Text style={styles.hostText}>{t('lobby.host')}</Text>
                  </View>
                )}
              </View>
            ))}
            {Array.from({ length: maxPlayers - players.length }).map((_, i) => (
              <View key={`empty-${i}`} style={[styles.playerRow, styles.emptySlot]}>
                <View style={[styles.playerAvatar, styles.emptyAvatar]}>
                  <MaterialCommunityIcons name="account-plus" size={18} color={Colors.textSecondary} />
                </View>
                <Text style={styles.emptyText}>{t('lobby.waitingPlayer')}</Text>
              </View>
            ))}
          </View>

          {canStart && (
            <View style={{ flex: 1 }} />
          )}

          {canStart && (
            <Pressable
              style={({ pressed }) => [styles.startButton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={handleStartGame}
              testID="start-game-btn"
            >
              <MaterialCommunityIcons name="play" size={22} color={Colors.textDark} />
              <Text style={styles.startButtonText}>{t('lobby.startGame')}</Text>
            </Pressable>
          )}

          {!isHost && (
            <View style={styles.waitingMsg}>
              <ActivityIndicator size="small" color={Colors.gold} />
              <Text style={styles.waitingText}>{t('lobby.waitingHost')}</Text>
            </View>
          )}
        </>
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
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.gold,
    marginBottom: 24,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  statusText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  retryText: {
    color: Colors.textDark,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  roomCodeCard: {
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  roomCodeLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  roomCode: {
    color: Colors.gold,
    fontSize: 40,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 8,
    marginVertical: 8,
  },
  roomCodeHint: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  playersSection: {
    gap: 8,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  emptySlot: {
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: Colors.whiteAlpha,
    backgroundColor: 'transparent',
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.whiteAlpha,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyAvatar: {
    backgroundColor: 'transparent',
  },
  playerName: {
    flex: 1,
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  emptyText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  youBadge: {
    backgroundColor: 'rgba(212, 168, 67, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  youText: {
    color: Colors.gold,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  hostBadge: {
    backgroundColor: Colors.whiteAlpha,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  hostText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
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
  startButtonText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.textDark,
  },
  waitingMsg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 24,
  },
  waitingText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
