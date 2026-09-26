import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Animated, Modal, Alert, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/shared/constants/colors';
import {
  MATCH_END_TIMEOUT_SECONDS,
  REMATCH_WAIT_SECONDS,
  TRICK_DISPLAY_MS,
  AI_DELAY_MIN_MS,
  AI_DELAY_MAX_MS,
  DEAL_ANIMATION_DURATION_MS,
  DEAL_ANIMATION_STAGGER_MS,
  DEAL_ANIMATION_TOTAL_MS,
  GAME_SPEED_MULTIPLIER,
} from '@/shared/constants/game';
import GameCard from '@/components/Card';
import GameTable from '@/components/GameTable';
import OpponentHand from '@/components/OpponentHand';
import ScoreBoard from '@/components/ScoreBoard';
import TutorialModal from '@/components/Tutorial';
import { getApiUrl } from '@/shared/query-client';
import { t } from '@/shared/i18n';
import { createGameState, playCard, completeTrick, nextStarter } from '@/shared/lib/brisca/engine';
import { GameState, Card, AIDifficulty } from '@/shared/lib/types';
import { chooseAICard } from '@/shared/lib/brisca/ai';
import { pickOpponents, toPersona } from '@/shared/lib/brisca/opponents';
import { suggestPlay } from '@/shared/lib/brisca/coach';
import { lessonForTrick, CoachLesson } from '@/shared/lib/brisca/trick-review';
import { ServerMessage, ClientMessage } from '@/shared/lib/types/messages';
import { wsErrorText } from '@/shared/lib/api-errors';
import { getAppVersion } from '@/shared/lib/app-version';
import { useSettings } from '@/shared/hooks/useSettings';
import { takeGameWs, storeGameWs } from '@/shared/ws-store';
import { loadRoomSession, clearRoomSession, saveRoomSession } from '@/shared/lib/room-session';
import { useSocketLiveness } from '@shared/hooks/useSocketLiveness';
import { useLanguage } from '@shared/hooks/useLanguage';
import { useAuth } from '@shared/hooks/useAuth';
import { useGuestMode } from '@shared/hooks/useGuestMode';
import { useQueryClient } from '@tanstack/react-query';
import { useEntitlement } from '@shared/hooks/useEntitlement';
import { useInterstitialAd } from '@shared/hooks/useInterstitialAd';
import { useReviewPrompt } from '@shared/hooks/useReviewPrompt';
import { CardMetricsProvider, useComputedCardMetrics } from '@shared/hooks/useCardMetrics';
import {
  nextTableCorrection,
  COACH_BANNER_LINE_HEIGHT,
  COACH_BANNER_MARGIN,
} from '@shared/lib/brisca/card-metrics';

const HUMAN_ID = 'human';
const MAX_RECONNECT_ATTEMPTS = 3;
/**
 * The your-turn glow around the hand, per side. Always drawn, transparent when
 * unlit — see `CHROME.handPadding`, which has always counted it as present.
 */
const HAND_GLOW_BORDER = 2;

/** Icon and colour per kind of coach message. `hint` is the only one the banner adds. */
const COACH_TONE = {
  hint: { icon: 'lightbulb-on' as const, color: Colors.successText },
  good: { icon: 'thumb-up-outline' as const, color: Colors.successText },
  warn: { icon: 'alert-circle-outline' as const, color: Colors.gold },
  info: { icon: 'cards-playing-outline' as const, color: Colors.textSecondary },
};

interface CoachBannerMessage {
  key: string;
  params?: Record<string, string | number>;
  tone: keyof typeof COACH_TONE;
}

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
    // Run once on mount: animRef is a ref (stable), and re-running for index
    // or isNew changes mid-animation would visibly stutter the deal-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    practice?: string;
    isHost?: string;
  }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const isOnline = params.mode === 'online';
  const isPractice = params.practice === '1';
  const numPlayers = parseInt(params.playerCount || '2', 10);
  const playerName = params.playerName || t('setup.defaultName');
  const difficulty = (params.difficulty || 'medium') as AIDifficulty;

  const { settings } = useSettings();
  const trickDisplayMs = TRICK_DISPLAY_MS * GAME_SPEED_MULTIPLIER[settings.gameSpeed];

  const [myId, setMyId] = useState(isOnline ? (params.myPlayerId || '') : HUMAN_ID);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const isMyTurn = gameState?.players[gameState.currentPlayerIndex]?.id === myId && gameState?.phase === 'playing';
  // Card sizes come from the viewport rather than hardcoded constants. Practice
  // mode permanently reserves room for the coach banner so the table doesn't
  // resize when a hint appears mid-turn, and the player count matters because a
  // 3-4 player trick area has to fit three cards across instead of one.
  // Prefer the live game state — an online room's size isn't in the route params.
  // Felt the column turned out not to need, measured rather than modelled — see
  // `extraTableHeight`. Reset when the viewport changes so a rotation or a
  // resize starts from the estimate again instead of an old correction.
  const [extraTableHeight, setExtraTableHeight] = useState(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  useEffect(() => { setExtraTableHeight(0); }, [windowWidth, windowHeight]);
  const cardMetrics = useComputedCardMetrics(
    isPractice,
    gameState?.players.length ?? numPlayers,
    extraTableHeight,
  );
  const [errorMsg, setErrorMsg] = useState('');
  // Practice-mode coach: the currently hinted card + why, and access to the
  // How-to-Play modal from inside the game.
  const [hintedCardId, setHintedCardId] = useState<string | null>(null);
  const [hintReason, setHintReason] = useState<{ key: string; params?: Record<string, number> } | null>(null);
  // The lesson from the trick just finished — what your move cost or earned if
  // there is anything to say, and otherwise who took the trick and why. Held in
  // state rather than derived from `phase === 'trickComplete'` so it survives
  // past the 750ms the trick is on screen at fast speed; it stays until the
  // player's next move, which is the only way there's time to read it.
  //
  // Both halves come from one call for exactly that reason. They used to be two
  // values — this one in state, the "who won" recap derived from the phase — and
  // since `reviewTrick` stays quiet on most tricks by design, the derived one was
  // what the player saw most and it vanished with the phase.
  const [trickLesson, setTrickLesson] = useState<CoachLesson | null>(null);
  const handBeforePlayRef = useRef<Card[]>([]);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showAfkWarning, setShowAfkWarning] = useState(false);
  const [afkSecondsLeft, setAfkSecondsLeft] = useState(30);
  const seenCardIdsRef = useRef<Set<string>>(new Set());
  const trickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTokenRef = useRef('');
  const [isHost, setIsHost] = useState(params.isHost === '1');
  const [autoLeaveIn, setAutoLeaveIn] = useState<number | null>(null);
  const [waitingForHost, setWaitingForHost] = useState(false);
  const [awayIds, setAwayIds] = useState<string[]>([]);
  const rematchHandledRef = useRef(false);
  // Declared here: the handlers below bind before enterRematchLobby exists.
  const enterRematchLobbyRef = useRef<(d: Extract<ServerMessage, { type: 'room_joined' }>) => void>(() => {});
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afkCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  const { getToken } = useAuth();
  const { isGuest } = useGuestMode();
  const queryClient = useQueryClient();
  const { isPremium } = useEntitlement();
  const { showAd } = useInterstitialAd(isPremium);
  const { recordGameFinished } = useReviewPrompt();
  const historySavedRef = useRef(false);
  const reviewPromptedRef = useRef(false);
  // Which seat led the previous game, so a rematch can pass the lead along
  // instead of re-drawing it. Null until the first game of this screen.
  const lastStarterRef = useRef<number | null>(null);
  const turnPulseAnim = useRef(new Animated.Value(1)).current;
  const turnPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const handGlowAnim = useRef(new Animated.Value(0)).current;

  const initGame = useCallback(() => {
    const is2v2 = numPlayers === 4;
    // Drawn fresh every game, never repeating a seat. The difficulty stays the
    // one the player chose — a persona changes how a bot plays, not how well.
    const picks = pickOpponents(is2v2 ? 3 : 1);
    const seat = (i: number, team?: number) => ({
      id: `ai-${i + 1}`,
      name: picks[i].name,
      personaId: picks[i].id,
      isAI: true,
      difficulty,
      team,
    });

    const configs: {
      id: string; name: string; isAI: boolean;
      difficulty?: AIDifficulty; team?: number; personaId?: string;
    }[] = [
      { id: HUMAN_ID, name: playerName, isAI: false, team: is2v2 ? 1 : undefined },
    ];
    if (is2v2) {
      configs.push(seat(0, 2), seat(1, 1), seat(2, 2));
    } else {
      configs.push(seat(0));
    }
    // The lead is worth real points, and it used to be the human's every single
    // game. Drawn once per screen, then rotated on each rematch.
    const startingPlayerIndex = nextStarter(lastStarterRef.current, configs.length);
    lastStarterRef.current = startingPlayerIndex;

    const state = createGameState(configs, undefined, { startingPlayerIndex });
    setMyId(HUMAN_ID);
    setGameState(state);

    setErrorMsg('');
    seenCardIdsRef.current = new Set();
    historySavedRef.current = false;
    reviewPromptedRef.current = false;
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
          sendWsMessage({ type: 'reconnect', playerId, reconnectToken: reconnectTokenRef.current, appVersion: getAppVersion() });
        };
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerMessage;
          switch (data.type) {
            case 'pong':
              notePongRef.current();
              break;
            case 'rematch_ready':
              // Claim a seat unprompted, so tap order stops mattering.
              setAutoLeaveIn(null);
              setWaitingForHost(true);
              sendWsMessage({ type: 'rematch', playerName });
              break;
            case 'room_joined':
              enterRematchLobbyRef.current(data);
              break;
            case 'presence':
              setAwayIds(prev => data.connected
                ? prev.filter(id => id !== data.playerId)
                : prev.includes(data.playerId) ? prev : [...prev, data.playerId]);
              break;
            case 'game_update':
            case 'reconnected':
              setGameState(data.gameState);
              setErrorMsg('');
              setIsReconnecting(false);
              reconnectAttemptsRef.current = 0;
              if (afkCountdownRef.current) { clearInterval(afkCountdownRef.current); afkCountdownRef.current = null; }
              setShowAfkWarning(false);
              break;
            case 'afk_warning': {
              const forMe = !data.playerId || !myIdRef.current || data.playerId === myIdRef.current;
              // Addressed to the other player: never render it here.
              if (!forMe) break;
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
            }
            case 'error':
              setErrorMsg(wsErrorText(data.code, data.message));
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

  /** Hand the live socket to the lobby rather than closing it. */
  // Only non-hosts get a clock; the host is the one who can rebuild the room.
  useEffect(() => {
    if (!isOnline || gameState?.phase !== 'gameOver' || rematchHandledRef.current) return;
    // Once a rematch is requested, the wait for a reply gets its own bound.
    if (isHost && !waitingForHost) return;
    let left = waitingForHost ? REMATCH_WAIT_SECONDS : MATCH_END_TIMEOUT_SECONDS;
    setAutoLeaveIn(left);
    const id = setInterval(() => {
      left -= 1;
      setAutoLeaveIn(left);
      if (left <= 0) {
        clearInterval(id);
        void clearRoomSession();
        router.replace({ pathname: '/lobby-browser', params: { playerName } });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isOnline, gameState?.phase, isHost, waitingForHost, playerName]);

  const enterRematchLobby = useCallback(async (data: Extract<ServerMessage, { type: 'room_joined' }>) => {
    if (rematchHandledRef.current) return;
    rematchHandledRef.current = true;
    const ws = wsRef.current;
    await saveRoomSession({
      roomCode: data.roomCode,
      playerId: data.playerId,
      reconnectToken: data.reconnectToken,
      playerName,
      maxPlayers: data.maxPlayers,
      isHost: data.hostId ? data.hostId === data.playerId : false,
    });
    if (ws) {
      ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null;
      storeGameWs(ws, data.playerId, data.reconnectToken);
      wsRef.current = null;
    }
    router.replace({
      pathname: '/online-lobby',
      params: {
        action: 'rematch',
        playerName,
        roomCode: data.roomCode,
        playerCount: String(data.maxPlayers),
        lobbyState: JSON.stringify(data),
      },
    });
  }, [playerName]);
  enterRematchLobbyRef.current = enterRematchLobby;

  const { notePong } = useSocketLiveness({
    getSocket: () => wsRef.current,
    onDead: () => {
      const ws = wsRef.current;
      if (ws) { try { ws.close(); } catch { /* already gone */ } }
      else scheduleReconnect(myIdRef.current);
    },
    enabled: isOnline,
  });
  const notePongRef = useRef(notePong);
  notePongRef.current = notePong;

  useEffect(() => {
    if (isOnline && params.initialState) {
      void (async () => {
        try {
          const state = JSON.parse(params.initialState!) as GameState;
          const pid = params.myPlayerId || '';
          setMyId(pid);
          myIdRef.current = pid;
          setGameState(state);
          const stored = takeGameWs();
          if (stored?.reconnectToken) reconnectTokenRef.current = stored.reconnectToken;
          if (!stored?.reconnectToken || !params.isHost) {
            const saved = await loadRoomSession();
            if (saved?.playerId === pid) {
              if (!stored?.reconnectToken) reconnectTokenRef.current = saved.reconnectToken;
              if (!params.isHost) setIsHost(saved.isHost);
            }
          }
          connectOnlineWebSocket(pid, stored?.ws);
        } catch {
          router.replace('/');
        }
      })();
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

    // The very first card of the game: nothing played, no trick finished yet.
    // Now that the starting seat is drawn, the AI can hold this lead, and its
    // normal 600ms delay would land it mid deal-in. Wait the animation out.
    const isOpeningLead = gameState.currentTrick.length === 0 && gameState.lastTrick === null;
    const delay =
      AI_DELAY_MIN_MS +
      Math.random() * AI_DELAY_MAX_MS +
      (isOpeningLead ? DEAL_ANIMATION_TOTAL_MS : 0);

    aiTimerRef.current = setTimeout(() => {
      const persona = toPersona(currentPlayer.personaId);
      const card = chooseAICard(
        gameState,
        currentPlayer.id,
        currentPlayer.difficulty ?? 'medium',
        persona ? { weights: persona.weights } : {},
      );
      if (card) setGameState(playCard(gameState, currentPlayer.id, card));
    }, delay);

    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [gameState?.currentPlayerIndex, gameState?.phase, gameState?.currentTrick.length, isOnline]);

  useEffect(() => {
    if (!gameState || gameState.phase !== 'trickComplete' || isOnline) return;
    trickTimerRef.current = setTimeout(() => {
      setGameState(completeTrick(gameState));

    }, trickDisplayMs);

    return () => { if (trickTimerRef.current) clearTimeout(trickTimerRef.current); };
  }, [gameState?.phase, isOnline, trickDisplayMs]);

  // Review the finished trick against what the player actually did. Runs once
  // per trick, on the transition into `trickComplete`.
  useEffect(() => {
    if (!isPractice || gameState?.phase !== 'trickComplete') return;
    setTrickLesson(lessonForTrick({
      trick: gameState.currentTrick,
      trumpSuit: gameState.trumpSuit,
      players: gameState.players,
      playerId: myIdRef.current,
      handBeforePlay: handBeforePlayRef.current,
    }));
    // Deliberately keyed on the phase alone: once the trick is complete its
    // cards are final, so re-running on every `currentTrick` identity change
    // would just recompute the same review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.phase, isPractice]);

  useEffect(() => {
    if (gameState?.phase !== 'gameOver' || isGuest || isPractice || historySavedRef.current) return;
    historySavedRef.current = true;

    const humanPlayer = gameState.players.find(p => p.id === myId);
    if (!humanPlayer) return;

    const opponentScore = Math.max(
      ...gameState.players.filter(p => p.id !== myId).map(p => p.score)
    );
    const result = humanPlayer.score > opponentScore ? 'win' : 'loss';

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const baseUrl = getApiUrl();
        await fetch(`${baseUrl}api/game-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            result,
            score: humanPlayer.score,
            opponentScore,
            mode: isOnline ? 'online' : 'ai',
            aiDifficulty: isOnline ? undefined : difficulty,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      } catch {}
    })();
  }, [gameState?.phase]);

  // Ask for a Play rating on the way into `gameOver`, which is before the
  // player can reach the interstitial on Play Again / Exit. Requesting a review
  // straight after an ad is a reliable way to collect one-star ratings.
  //
  // Guests are included on purpose — a guest who has won three games is a fine
  // person to ask. Practice games are not real wins, so they never count.
  useEffect(() => {
    if (gameState?.phase !== 'gameOver' || isPractice || reviewPromptedRef.current) return;
    reviewPromptedRef.current = true;

    const humanPlayer = gameState.players.find(p => p.id === myId);
    if (!humanPlayer) return;

    const opponentScore = Math.max(
      ...gameState.players.filter(p => p.id !== myId).map(p => p.score)
    );
    recordGameFinished(humanPlayer.score > opponentScore);
  }, [gameState?.phase]);

  useEffect(() => {
    if (isMyTurn) {
      turnPulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(turnPulseAnim, { toValue: 1.12, duration: 600, useNativeDriver: true }),
          Animated.timing(turnPulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      turnPulseLoopRef.current.start();
      Animated.timing(handGlowAnim, { toValue: 1, duration: 350, useNativeDriver: false }).start();
    } else {
      turnPulseLoopRef.current?.stop();
      turnPulseLoopRef.current = null;
      turnPulseAnim.setValue(1);
      Animated.timing(handGlowAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
    }
  }, [isMyTurn]);

  // Clear any active hint whenever it stops being the human's turn (e.g. right
  // after playing) so a stale suggestion never lingers on the next turn.
  useEffect(() => {
    if (!isMyTurn) {
      setHintedCardId(null);
      setHintReason(null);
    }
  }, [isMyTurn]);

  const handleHint = useCallback(() => {
    if (!gameState) return;
    const suggestion = suggestPlay(gameState, myIdRef.current);
    if (suggestion) {
      setHintedCardId(suggestion.card.id);
      setHintReason({ key: suggestion.reasonKey, params: suggestion.params });
    }
  }, [gameState]);

  const handlePlayCard = useCallback((card: Card) => {
    if (!gameState || gameState.phase !== 'playing') return;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.id !== myIdRef.current) return;

    setHintedCardId(null);
    setHintReason(null);
    setTrickLesson(null);

    if (isPractice) {
      // Snapshot the hand *before* the engine removes the card: reviewing the
      // trick afterwards needs to know what else was available, and by then the
      // played card is already gone from the hand.
      const me = gameState.players.find(p => p.id === myIdRef.current);
      handBeforePlayRef.current = me ? [...me.hand] : [];
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (isOnline) {
      sendWsMessage({ type: 'play_card', cardId: card.id });
    } else {
      setGameState(playCard(gameState, myIdRef.current, card));
    }
  }, [gameState, isOnline, isPractice, sendWsMessage]);

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
  const teamMode = humanPlayer.team !== undefined;

  // Banner precedence: what to do now beats what just happened. Everything about
  // the finished trick is already resolved into one value with one lifetime —
  // see `trickLesson`.
  const coachMessage: CoachBannerMessage | null = hintReason
    ? { key: hintReason.key, params: hintReason.params, tone: 'hint' }
    : trickLesson;

  return (
    <CardMetricsProvider value={cardMetrics}>
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
          const leave = () => {
            if (isOnline) void clearRoomSession();
            if (wsRef.current) {
              if (isOnline && gameState.phase !== 'gameOver') {
                sendWsMessage({ type: 'leave_game' });
              }
              wsRef.current.onclose = null;
              wsRef.current.onerror = null;
              wsRef.current.close();
            }
            router.replace('/');
          };
          if (isOnline && gameState.phase !== 'gameOver') {
            Alert.alert(
              t('game.leaveTitle'),
              t('game.leaveMessage'),
              [
                { text: t('game.leaveCancel'), style: 'cancel' },
                { text: t('game.leaveConfirm'), style: 'destructive', onPress: leave },
              ]
            );
          } else {
            leave();
          }
        }} testID="game-back-btn">
          <MaterialCommunityIcons name="close" size={22} color={Colors.white} />
        </Pressable>
        {isMyTurn && (
          <Animated.View style={[styles.turnIndicator, { transform: [{ scale: turnPulseAnim }] }]}>
            <Text style={styles.turnText}>{t('game.yourTurn')}</Text>
          </Animated.View>
        )}
        <View style={{ flex: 1 }} />
        {isPractice && isMyTurn && (
          <Pressable style={styles.hintBtn} onPress={handleHint} testID="hint-btn">
            <MaterialCommunityIcons name="lightbulb-on" size={16} color={Colors.successText} />
            <Text style={styles.hintBtnText}>{t('game.hint')}</Text>
          </Pressable>
        )}
        {!isOnline && (
          <Pressable style={styles.helpBtn} onPress={() => setTutorialVisible(true)} testID="game-help-btn">
            <MaterialCommunityIcons name="help-circle-outline" size={22} color={Colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* The slot is on screen for the whole of practice mode, message or not.
          `card-metrics` reserves its height permanently so the table does not
          resize when a hint appears mid-turn — and that reservation only holds
          if the space is really occupied. Rendering it only when there was
          something to say left the first trick with 41dp of table that nothing
          was using; the measurement loop took it, the banner then arrived and
          took it back, and the played cards were left sized for a table taller
          than the one that clips them. */}
      {isPractice && (
        <View
          style={[
            styles.coachBanner,
            { height: cardMetrics.coachBanner.height },
            coachMessage
              ? {
                  borderColor: `${COACH_TONE[coachMessage.tone].color}80`,
                  backgroundColor: `${COACH_TONE[coachMessage.tone].color}22`,
                }
              : styles.coachBannerEmpty,
          ]}
          testID="coach-banner"
        >
          {coachMessage && (
            <>
              <MaterialCommunityIcons
                name={COACH_TONE[coachMessage.tone].icon}
                size={16}
                color={COACH_TONE[coachMessage.tone].color}
              />
              {/* Clamped to the lines the box was built for. The longest
                  strings wrap to three on a narrow phone, and a banner that
                  grows is a table that shrinks under the player mid-lesson. */}
              <Text style={styles.coachBannerText} numberOfLines={cardMetrics.coachBanner.lines}>
                {t(coachMessage.key, coachMessage.params as Record<string, string | number>)}
              </Text>
            </>
          )}
        </View>
      )}

      <View style={[styles.opponentsRow, { minHeight: cardMetrics.small.height }]}>
        {opponents.map((opp) => (
          <OpponentHand
            key={opp.id}
            player={opp}
            isCurrentTurn={gameState.players[gameState.currentPlayerIndex]?.id === opp.id}
            isTeammate={teamMode && opp.team === humanPlayer.team}
            isAway={awayIds.includes(opp.id)}
          />
        ))}
      </View>

      {/* The table takes the whole remainder, and then reports how much that
          actually was. Every other height here is modelled from constants, and
          on a real device the model can be off by tens of dp in either
          direction — too little and the cards are denied felt they could use,
          too much and they are drawn past a border that clips them. Feeding the
          difference back sizes them from the real box; it settles in one pass,
          because once the metrics know the true height the difference is zero.
          See `nextTableCorrection` for why it has to correct downward too. */}
      <View
        style={styles.tableContainer}
        onLayout={(e) => {
          const real = Math.round(e.nativeEvent.layout.height);
          setExtraTableHeight(prev => nextTableCorrection(prev, real, cardMetrics.tableMaxHeight));
        }}
      >
        <GameTable gameState={gameState} humanPlayerId={myId} />
      </View>

      <Animated.View style={[
        styles.handContainer,
        {
          // Width fixed, colour animated. Animating the width made the hand
          // container 4dp taller on your turn, which came straight out of the
          // table below it and resized the played cards every turn.
          borderWidth: HAND_GLOW_BORDER,
          borderColor: handGlowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['rgba(212, 168, 67, 0)', 'rgba(212, 168, 67, 1)'],
          }),
          borderRadius: 14,
          shadowColor: Colors.gold,
          shadowOpacity: handGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }),
          shadowRadius: handGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }),
          shadowOffset: { width: 0, height: 0 },
          elevation: handGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
        },
      ]}>
        <Animated.Text style={[styles.handTurnLabel, { opacity: handGlowAnim }]}>
          {t('game.yourTurn')}
        </Animated.Text>
        {/* Holds a card's worth of height even with nothing in it. On the last
            trick every hand is empty, and without this the row collapsed to 0,
            the opponents' rows collapsed with it, and `tableContainer` (flex: 1)
            swallowed the lot — the felt went from 372dp to 570dp and the played
            cards drifted to the far corners of a table that had suddenly grown
            by half. `columnHeight()` in card-metrics has always modelled this
            height as present all game; reserving it is what makes that true. */}
        <View style={[styles.hand, { gap: cardMetrics.handGap, minHeight: cardMetrics.large.height }]}>
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
                  hinted={card.id === hintedCardId}
                />
              </DealAnimatedCard>
            );
          })}
        </View>
      </Animated.View>

      {gameState.phase === 'gameOver' && (
        <ScoreBoard
          players={gameState.players}
          myId={isOnline ? myId : undefined}
          endReason={gameState.endReason}
          forfeitedBy={gameState.forfeitedBy}
          autoLeaveIn={autoLeaveIn}
          waitingForHost={waitingForHost}
          onPlayAgain={() => {
            if (isOnline) {
                setAutoLeaveIn(null);
              setWaitingForHost(true);
              sendWsMessage({ type: 'rematch', playerName });
              return;
            }
            showAd().then(() => initGame());
          }}
          onExit={() => {
            showAd().then(() => {
              if (isOnline) void clearRoomSession();
              if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.onerror = null; wsRef.current.close(); }
              router.replace('/');
            });
          }}
        />
      )}

      <TutorialModal visible={tutorialVisible} onClose={() => setTutorialVisible(false)} />

      <Modal visible={showAfkWarning} transparent animationType="fade">
        <View style={styles.afkOverlay}>
          <View style={styles.afkCard}>
            <MaterialCommunityIcons name="timer-outline" size={40} color={Colors.gold} />
            <Text style={styles.afkTitle}>{t('game.afkWarningTitle')}</Text>
            <Text style={styles.afkCountdown}>{afkSecondsLeft}s</Text>
            <Text style={styles.afkMessage}>{t('game.afkWarningMessage')}</Text>
            <Pressable
              style={({ pressed }) => [styles.afkBtn, pressed && { opacity: 0.8 }]}
              onPress={() => {
                // Tell the server, not just the screen.
                if (isOnline) sendWsMessage({ type: 'still_here' });
                if (afkCountdownRef.current) {
                  clearInterval(afkCountdownRef.current);
                  afkCountdownRef.current = null;
                }
                setShowAfkWarning(false);
              }}
            >
              <Text style={styles.afkBtnText}>{t('game.afkWarningAction')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
    </CardMetricsProvider>
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
  hintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(46, 125, 50, 0.2)',
    borderWidth: 1,
    borderColor: Colors.success,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hintBtnText: {
    color: Colors.successText,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  helpBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.whiteAlpha,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coachBanner: {
    // The height is set inline from `cardMetrics.coachBanner`: `card-metrics`
    // reserves that exact number out of the table, and a box that sized itself
    // to whatever the current lesson happened to be would make the reservation
    // a fiction. Padding and border here have to match what it assumes.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(46, 125, 50, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(46, 125, 50, 0.5)',
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: COACH_BANNER_MARGIN,
  },
  /** Holds the reserved height without drawing anything, between lessons. */
  coachBannerEmpty: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  coachBannerText: {
    color: Colors.white,
    fontSize: 13,
    // Explicit so the reserved height is arithmetic and not a guess at what the
    // platform does with Inter at 13px.
    lineHeight: COACH_BANNER_LINE_HEIGHT,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  opponentsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tableContainer: {
    flex: 1,
    marginBottom: 10,
  },
  handContainer: {
    alignItems: 'center',
    padding: 6,
    paddingBottom: 4,
  },
  handTurnLabel: {
    color: Colors.gold,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  hand: {
    flexDirection: 'row',
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
