import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Animated, Modal, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/shared/constants/colors';
import {
  TRICK_DISPLAY_MS,
  AI_DELAY_MIN_MS,
  AI_DELAY_MAX_MS,
  DEAL_ANIMATION_DURATION_MS,
  DEAL_ANIMATION_STAGGER_MS,
  GAME_SPEED_MULTIPLIER,
} from '@/shared/constants/game';
import GameCard from '@/components/Card';
import GameTable from '@/components/GameTable';
import OpponentHand from '@/components/OpponentHand';
import ScoreBoard from '@/components/ScoreBoard';
import { getApiUrl } from '@/shared/query-client';
import { t } from '@/shared/i18n';
import { createGameState, playCard, completeTrick } from '@/shared/lib/brisca/engine';
import { GameState, Card, AIDifficulty } from '@/shared/lib/types';
import { chooseAICard } from '@/shared/lib/brisca/ai';
import { ServerMessage, ClientMessage } from '@/shared/lib/types/messages';
import { useSettings } from '@/shared/hooks/useSettings';
import { takeGameWs } from '@/shared/ws-store';
import { useLanguage } from '@shared/hooks/useLanguage';

const AI_NAMES = ['Carlos', 'Maria', 'Pedro'];
const HUMAN_ID = 'human';
const MAX_RECONNECT_ATTEMPTS = 3;

function DealAnimatedCard({ children, index, isNew }: { children: React.ReactNode; index: number; isNew: boolean }) {
  const animRef = useRef(new Animated.Value(isNew ? 0 : 1)).current;

  useEffect(() => {
    if (!isNew) return;
    Animated.timing(animRef, {
      toValue: 1,
      duration: DEAL_ANIMATION_DURATION_MS,
      delay: index * DEAL_ANIMATION_STAGGER_MS,
      useNativeDriver: true,
    }).start();
  }, []);

  const translateY = animRef.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const scale = animRef.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.7, 1.05, 1] });

  return (
    <Animated.View style={{ opacity: animRef, transform: [{ translateY }, { scale }] }}>
      {children}
    </Animated.View>
  );
}

export default function GameScreen() {
  useLanguage();
  const params = useLocalSearchParams<{
    mode: string;
    playerCount: string;
    playerName: string;
    difficulty?: string;
    initialState?: string;
    myPlayerId?: string;
    roomCode?: string;
  }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const { height: screenHeight } = useWindowDimensions();
  const tableMaxHeight = Math.max(180, screenHeight * 0.47);
  const isOnline = params.mode === 'online';
  const numPlayers = parseInt(params.playerCount || '2', 10);
  const playerName = params.playerName || t('setup.defaultName');
  const difficulty = (params.difficulty || 'medium') as AIDifficulty;

  const { settings } = useSettings();
  const trickDisplayMs = TRICK_DISPLAY_MS * GAME_SPEED_MULTIPLIER[settings.gameSpeed];

  const [myId, setMyId] = useState(isOnline ? (params.myPlayerId || '') : HUMAN_ID);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showAfkWarning, setShowAfkWarning] = useState(false);
  const [afkSecondsLeft, setAfkSecondsLeft] = useState(30);
  const seenCardIdsRef = useRef<Set<string>>(new Set());
  const trickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afkCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  const initGame = useCallback(() => {
    const is2v2 = numPlayers === 4;
    const configs: { id: string; name: string; isAI: boolean; difficulty?: AIDifficulty; team?: number }[] = [
      { id: HUMAN_ID, name: playerName, isAI: false, team: is2v2 ? 1 : undefined },
    ];
    if (is2v2) {
      configs.push({ id: 'ai-1', name: AI_NAMES[0], isAI: true, difficulty, team: 2 });
      configs.push({ id: 'ai-2', name: AI_NAMES[1], isAI: true, difficulty, team: 1 });
      configs.push({ id: 'ai-3', name: AI_NAMES[2], isAI: true, difficulty, team: 2 });
    } else {
      configs.push({ id: 'ai-1', name: AI_NAMES[0], isAI: true, difficulty });
    }
    const state = createGameState(configs);
    setMyId(HUMAN_ID);
    setGameState(state);

    setErrorMsg('');
    seenCardIdsRef.current = new Set();
  }, [numPlayers, playerName, difficulty]);

  const sendWsMessage = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connectOnlineWebSocket = useCallback((playerId: string, existingWs?: WebSocket) => {
    try {
      const ws = existingWs ?? (() => {
        const baseUrl = getApiUrl();
        const wsUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        return new WebSocket(wsUrl);
      })();
      wsRef.current = ws;

      if (!existingWs) {
        // New connection — must re-register with server once open
        ws.onopen = () => {
          setIsReconnecting(true);
          sendWsMessage({ type: 'reconnect', playerId });
        };
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerMessage;
          switch (data.type) {
            case 'game_update':
            case 'reconnected':
              setGameState(data.gameState);
              setErrorMsg('');
              setIsReconnecting(false);
              reconnectAttemptsRef.current = 0;
              if (afkCountdownRef.current) { clearInterval(afkCountdownRef.current); afkCountdownRef.current = null; }
              setShowAfkWarning(false);
              break;
            case 'afk_warning':
              setAfkSecondsLeft(data.secondsLeft);
              setShowAfkWarning(true);
              if (afkCountdownRef.current) clearInterval(afkCountdownRef.current);
              afkCountdownRef.current = setInterval(() => {
                setAfkSecondsLeft(prev => {
                  if (prev <= 1) {
                    if (afkCountdownRef.current) { clearInterval(afkCountdownRef.current); afkCountdownRef.current = null; }
                    setShowAfkWarning(false);
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);
              break;
            case 'error':
              setErrorMsg(data.message);
              break;
          }
        } catch {
          setErrorMsg(t('game.syncError'));
        }
      };

      ws.onerror = () => {
        scheduleReconnect(playerId);
      };

      ws.onclose = () => {
        scheduleReconnect(playerId);
      };
    } catch {
      setErrorMsg(t('game.cannotConnect'));
    }
  }, [sendWsMessage]);

  const scheduleReconnect = useCallback((playerId: string) => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setErrorMsg(t('game.connectionLost'));
      setIsReconnecting(false);
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 8000);
    reconnectAttemptsRef.current += 1;
    setIsReconnecting(true);
    setErrorMsg(t('game.reconnecting'));
    reconnectTimerRef.current = setTimeout(() => {
      connectOnlineWebSocket(playerId);
    }, delay);
  }, [connectOnlineWebSocket]);

  useEffect(() => {
    if (isOnline && params.initialState) {
      try {
        const state = JSON.parse(params.initialState) as GameState;
        const pid = params.myPlayerId || '';
        setMyId(pid);
        setGameState(state);
        const stored = takeGameWs();
        connectOnlineWebSocket(pid, stored?.ws);
      } catch {
        router.replace('/');
      }
    } else {
      initGame();
    }
    return () => {
      if (trickTimerRef.current) clearTimeout(trickTimerRef.current);
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (afkCountdownRef.current) clearInterval(afkCountdownRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!gameState || gameState.phase !== 'playing' || isOnline) return;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer?.isAI) return;

    aiTimerRef.current = setTimeout(() => {
      const card = chooseAICard(gameState, currentPlayer.id, currentPlayer.difficulty ?? 'medium');
      if (card) setGameState(playCard(gameState, currentPlayer.id, card));
    }, AI_DELAY_MIN_MS + Math.random() * AI_DELAY_MAX_MS);

    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [gameState?.currentPlayerIndex, gameState?.phase, gameState?.currentTrick.length, isOnline]);

  useEffect(() => {
    if (!gameState || gameState.phase !== 'trickComplete' || isOnline) return;
    trickTimerRef.current = setTimeout(() => {
      setGameState(completeTrick(gameState));
  
    }, trickDisplayMs);

    return () => { if (trickTimerRef.current) clearTimeout(trickTimerRef.current); };
  }, [gameState?.phase, isOnline, trickDisplayMs]);

  const handlePlayCard = useCallback((card: Card) => {
    if (!gameState || gameState.phase !== 'playing') return;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.id !== myIdRef.current) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (isOnline) {
      sendWsMessage({ type: 'play_card', cardId: card.id });
    } else {
      setGameState(playCard(gameState, myIdRef.current, card));
    }
  }, [gameState, isOnline, sendWsMessage]);

  if (!gameState) {
    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <LinearGradient colors={[Colors.backgroundDark, Colors.background]} style={StyleSheet.absoluteFill} />
        <Text style={styles.loadingText}>{t('game.loading')}</Text>
      </View>
    );
  }

  const humanPlayer = gameState.players.find(p => p.id === myId);
  if (!humanPlayer) {
    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <LinearGradient colors={[Colors.backgroundDark, Colors.background]} style={StyleSheet.absoluteFill} />
        <Text style={styles.loadingText}>{t('game.connecting')}</Text>
      </View>
    );
  }

  const opponents = gameState.players.filter(p => p.id !== myId);
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === myId && gameState.phase === 'playing';
  const teamMode = humanPlayer.team !== undefined;
  const getOpponentPosition = (index: number): 'top' | 'left' | 'right' => {
    if (opponents.length === 1) return 'top';
    if (opponents.length === 2) return index === 0 ? 'left' : 'right';
    if (index === 0) return 'left';
    if (index === 1) return 'top';
    return 'right';
  };

  return (
    <View style={[styles.container, { paddingTop: topPadding + 8, paddingBottom: bottomPadding + 8 }]}>
      <LinearGradient colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]} style={StyleSheet.absoluteFill} />

      {(errorMsg || isReconnecting) && (
        <View style={[styles.errorBanner, isReconnecting && styles.warningBanner]}>
          <MaterialCommunityIcons
            name={isReconnecting ? 'wifi-sync' : 'alert-circle'}
            size={16}
            color={Colors.white}
          />
          <Text style={styles.errorBannerText}>{errorMsg}</Text>
        </View>
      )}

      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => {
          if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
          router.replace('/');
        }} testID="game-back-btn">
          <MaterialCommunityIcons name="close" size={22} color={Colors.white} />
        </Pressable>
        {isMyTurn && (
          <View style={styles.turnIndicator}>
            <Text style={styles.turnText}>{t('game.yourTurn')}</Text>
          </View>
        )}
      </View>

      <View style={styles.opponentsRow}>
        {opponents.map((opp, i) => (
          <OpponentHand
            key={opp.id}
            player={opp}
            isCurrentTurn={gameState.players[gameState.currentPlayerIndex]?.id === opp.id}
            position={getOpponentPosition(i)}
            isTeammate={teamMode && opp.team === humanPlayer.team}
          />
        ))}
      </View>

      <View style={[styles.tableContainer, { maxHeight: tableMaxHeight }]}>
        <GameTable gameState={gameState} humanPlayerId={myId} />
      </View>

      <View style={styles.handContainer}>
        <View style={styles.hand}>
          {humanPlayer.hand.map((card, i) => {
            const isNew = !seenCardIdsRef.current.has(card.id);
            if (isNew) seenCardIdsRef.current.add(card.id);
            return (
              <DealAnimatedCard key={card.id} index={i} isNew={isNew}>
                <GameCard
                  card={card}
                  size="large"
                  onPress={() => handlePlayCard(card)}
                  disabled={!isMyTurn}
                  highlighted={isMyTurn}
                />
              </DealAnimatedCard>
            );
          })}
        </View>
      </View>

      {gameState.phase === 'gameOver' && (
        <ScoreBoard
          players={gameState.players}
          myId={isOnline ? myId : undefined}
          onPlayAgain={() => {
            if (isOnline) {
              if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
              router.replace('/');
            } else {
              initGame();
            }
          }}
          onExit={() => {
            if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
            router.replace('/');
          }}
        />
      )}

      <Modal visible={showAfkWarning} transparent animationType="fade">
        <View style={styles.afkOverlay}>
          <View style={styles.afkCard}>
            <MaterialCommunityIcons name="timer-outline" size={40} color={Colors.gold} />
            <Text style={styles.afkTitle}>{t('game.afkWarningTitle')}</Text>
            <Text style={styles.afkCountdown}>{afkSecondsLeft}s</Text>
            <Text style={styles.afkMessage}>{t('game.afkWarningMessage')}</Text>
            <Pressable
              style={({ pressed }) => [styles.afkBtn, pressed && { opacity: 0.8 }]}
              onPress={() => setShowAfkWarning(false)}
            >
              <Text style={styles.afkBtnText}>{t('game.afkWarningAction')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    marginTop: 40,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 8,
  },
  warningBanner: {
    backgroundColor: Colors.goldDark,
  },
  errorBannerText: {
    color: Colors.white,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.whiteAlpha,
    justifyContent: 'center',
    alignItems: 'center',
  },
  turnIndicator: {
    backgroundColor: 'rgba(212, 168, 67, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  turnText: {
    color: Colors.gold,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  opponentsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    marginBottom: 8,
    minHeight: 80,
  },
  tableContainer: {
    flex: 1,
    marginBottom: 10,
  },
  handContainer: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  hand: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  afkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  afkCard: {
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.gold,
    width: '100%',
    maxWidth: 340,
  },
  afkTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
    marginTop: 4,
  },
  afkCountdown: {
    fontSize: 48,
    fontFamily: 'Inter_700Bold',
    color: Colors.gold,
  },
  afkMessage: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  afkBtn: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  afkBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textDark,
  },
});
