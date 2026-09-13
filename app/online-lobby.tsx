import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, Pressable, ActivityIndicator, Alert, Share, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/shared/constants/colors';
import { useContentPadding } from '@shared/hooks/useContentPadding';
import { t } from '@/shared/i18n';
import { getApiUrl } from '@/shared/query-client';
import {
  CONNECTION_TIMEOUT_MS,
  LOBBY_DISCONNECT_GRACE_MS,
  LOBBY_GONE_REDIRECT_SECONDS,
} from '@/shared/constants/game';
import type { ServerMessage, ClientMessage, RoomPlayerInfo } from '@/shared/lib/types/messages';
import { wsErrorText } from '@/shared/lib/api-errors';
import { getAppVersion } from '@/shared/lib/app-version';
import { storeGameWs, takeGameWs } from '@/shared/ws-store';
import { useLanguage } from '@shared/hooks/useLanguage';
import { nextReconnectDelay } from '@/shared/lib/reconnect-backoff';
import { chooseOpenMessage } from '@/shared/lib/lobby-open-message';
import { saveRoomSession, loadRoomSession, clearRoomSession } from '@/shared/lib/room-session';
import { useSocketLiveness } from '@shared/hooks/useSocketLiveness';

export default function OnlineLobbyScreen() {
  const params = useLocalSearchParams<{
    action: string;
    playerCount?: string;
    playerName: string;
    roomCode?: string;
    isPublic?: string;
    lobbyState?: string;
  }>();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const contentPadding = useContentPadding(24);

  const [roomId, setRoomId] = useState(params.roomCode || '');
  const [players, setPlayers] = useState<RoomPlayerInfo[]>([]);
  const [maxPlayers, setMaxPlayers] = useState(parseInt(params.playerCount || '2', 10));
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'starting' | 'error'>('connecting');
  // Socket handlers bind once, so they cannot read `status` directly.
  const statusRef = useRef(status);
  statusRef.current = status;
  const [errorMsg, setErrorMsg] = useState('');
  const [myId, setMyId] = useState('');
  const [hostId, setHostId] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  // Off if the server answers a ping with INVALID_MESSAGE (older build).
  const [pingsEnabled, setPingsEnabled] = useState(true);
  useLanguage();
  const wsRef = useRef<WebSocket | null>(null);
  const gameStartedRef = useRef(false);
  const myIdRef = useRef('');
  const roomIdRef = useRef(params.roomCode || '');
  // Mirrored into refs: socket handlers bind once and would read stale values.
  const maxPlayersRef = useRef(parseInt(params.playerCount || '2', 10));
  const hostIdRef = useRef('');
  const reconnectTokenRef = useRef('');
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set once a room exists, so a retry can never mint a second one. */
  const didCreateRef = useRef(false);
  /** When the socket first dropped — the clock the retry deadline runs against. */
  const disconnectedAtRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Errors there is no point retrying past (outdated app, room really gone). */
  const fatalRef = useRef(false);
  /** Caps the silent re-join after a stale token at one attempt, never a loop. */
  const triedRejoinRef = useRef(false);
  /** True once we have actually been inside the room at least once. */
  const everJoinedRef = useRef(false);
  const scheduleReconnectRef = useRef<() => void>(() => {});
  // Confirmed gone server-side, not merely unreachable.
  const [roomGone, setRoomGone] = useState(false);
  /** Seconds until a stranded non-host is taken back to the room list. */
  const [redirectIn, setRedirectIn] = useState<number | null>(null);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(0);
  const idleCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** The room is gone: drop every credential tied to our seat in it. */
  const forgetSeat = useCallback(() => {
    reconnectTokenRef.current = '';
    myIdRef.current = '';
    void clearRoomSession();
  }, []);

  const dismissIdleWarning = useCallback(() => {
    if (idleCountdownRef.current) {
      clearInterval(idleCountdownRef.current);
      idleCountdownRef.current = null;
    }
    setShowIdleWarning(false);
  }, []);

  const handleShare = async () => {
    // HTTPS link to our own server: clickable in email/chat, opens the app
    // when installed, and shows a get-the-app page otherwise. A raw bisca://
    // scheme URL is not linkified by mail clients and dead-ends without the app.
    const link = `${getApiUrl()}join/${roomId}`;
    try {
      await Share.share({
        message: `${t('lobby.shareMessage', { code: roomId })}\n${link}`,
        title: t('lobby.shareInvite'),
      });
    } catch {
      // Some iOS versions reject rather than resolve when the sheet is
      // dismissed. Nothing to recover — the code is on screen either way.
    }
  };

  /** Detach every handler before closing, so teardown can't trigger a retry. */
  const teardownSocket = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try { ws.close(); } catch { /* already gone */ }
    wsRef.current = null;
  }, []);

  const connectWebSocket = useCallback((existingWs?: WebSocket) => {
    // A retry must not leave the previous socket running: it would still be
    // holding the seat server-side and racing the new one.
    teardownSocket();
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    try {
      const baseUrl = getApiUrl();
      const wsUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
      // A rematch hands over an already-open socket: handlers, no handshake.
      const ws = existingWs ?? new WebSocket(wsUrl);
      wsRef.current = ws;

      if (!existingWs) {
      // Timeout if connection never establishes
      connectionTimeoutRef.current = setTimeout(() => {
        ws.close();
      }, CONNECTION_TIMEOUT_MS);

      ws.onopen = () => {
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        const choice = chooseOpenMessage({
          intent: params.action,
          reconnectToken: reconnectTokenRef.current,
          playerId: myIdRef.current,
          roomCode: roomIdRef.current || params.roomCode || '',
          hasCreated: didCreateRef.current,
        });

        let msg: ClientMessage;
        switch (choice.kind) {
          case 'reconnect':
            msg = {
              type: 'reconnect',
              playerId: myIdRef.current,
              reconnectToken: reconnectTokenRef.current,
              appVersion: getAppVersion(),
            };
            break;
          case 'create_room':
            didCreateRef.current = true;
            msg = {
              type: 'create_room',
              playerName: params.playerName,
              maxPlayers: parseInt(params.playerCount || '2', 10),
              isPublic: params.isPublic !== '0',
              appVersion: getAppVersion(),
            };
            break;
          case 'join_room':
            msg = {
              type: 'join_room',
              roomCode: choice.roomCode,
              playerName: params.playerName,
              appVersion: getAppVersion(),
            };
            break;
          default:
            // Nothing usable left to resume.
            fatalRef.current = true;
            setErrorMsg(t('lobby.sessionExpired'));
            setStatus('error');
            return;
        }
        ws.send(JSON.stringify(msg));
      };
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerMessage;
          switch (data.type) {
            case 'pong':
              notePongRef.current();
              break;
            case 'room_created':
            case 'room_joined': {
              setRoomId(data.roomCode);
              roomIdRef.current = data.roomCode;
              setMyId(data.playerId);
              myIdRef.current = data.playerId;
              reconnectTokenRef.current = data.reconnectToken;
              setPlayers(data.players);
              setMaxPlayers(data.maxPlayers);
              maxPlayersRef.current = data.maxPlayers;
              if (data.hostId) {
                setHostId(data.hostId);
                hostIdRef.current = data.hostId;
              }
              setStatus('waiting');
              everJoinedRef.current = true;
              reconnectAttemptRef.current = 0;
              disconnectedAtRef.current = null;
              setIsReconnecting(false);
              setErrorMsg('');
              void saveRoomSession({
                roomCode: data.roomCode,
                playerId: data.playerId,
                reconnectToken: data.reconnectToken,
                playerName: params.playerName,
                maxPlayers: data.maxPlayers,
                isHost: data.hostId ? data.hostId === data.playerId : params.action === 'create',
              });
              break;
            }
            case 'player_joined':
            case 'player_left':
              setPlayers(data.players);
              // A seat opening up means the room is filling again, not idling —
              // the server disarms its timer, so drop the prompt to match.
              if (data.players.length < maxPlayersRef.current) dismissIdleWarning();
              break;
            case 'afk_warning':
              // In a lobby this means "nobody has started the game and the room
              // is about to close", not the in-game "you are about to forfeit".
              setIdleSecondsLeft(data.secondsLeft);
              setShowIdleWarning(true);
              if (idleCountdownRef.current) clearInterval(idleCountdownRef.current);
              idleCountdownRef.current = setInterval(() => {
                setIdleSecondsLeft(prev => {
                  if (prev <= 1) {
                    if (idleCountdownRef.current) {
                      clearInterval(idleCountdownRef.current);
                      idleCountdownRef.current = null;
                    }
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);
              break;
            case 'game_start':
              if (!gameStartedRef.current) {
                gameStartedRef.current = true;
                setStatus('starting');
                if (Platform.OS !== 'web') {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
                // Hand the WS to the game screen — don't close it so the server
                // mapping (playerRooms) stays intact and play_card works immediately.
                ws.onopen = null;
                ws.onmessage = null;
                ws.onerror = null;
                ws.onclose = null;
                storeGameWs(ws, data.playerId || myIdRef.current, reconnectTokenRef.current);
                wsRef.current = null; // prevents lobby cleanup from closing it
                void saveRoomSession({
                  roomCode: roomIdRef.current,
                  playerId: data.playerId || myIdRef.current,
                  reconnectToken: reconnectTokenRef.current,
                  playerName: params.playerName,
                  maxPlayers: maxPlayersRef.current,
                  isHost: hostIdRef.current
                    ? hostIdRef.current === (data.playerId || myIdRef.current)
                    : params.action === 'create',
                });
                router.replace({
                  pathname: '/game',
                  params: {
                    mode: 'online',
                    playerCount: String(data.gameState.players.length),
                    playerName: params.playerName,
                    initialState: JSON.stringify(data.gameState),
                    myPlayerId: data.playerId || myIdRef.current,
                    isHost: (hostIdRef.current
                      ? hostIdRef.current === (data.playerId || myIdRef.current)
                      : params.action === 'create') ? '1' : '0',
                  },
                });
              }
              break;
            case 'error':
              if (data.code === 'LOBBY_IDLE') {
                fatalRef.current = true;
                dismissIdleWarning();
                forgetSeat();
                setRoomGone(true);
                setErrorMsg(wsErrorText(data.code, data.message));
                setStatus('error');
              } else if (data.code === 'HOST_LEFT') {
                fatalRef.current = true;
                forgetSeat();
                ws.onopen = null;
                ws.onmessage = null;
                ws.onerror = null;
                ws.onclose = null;
                wsRef.current = null;
                Alert.alert(
                  t('lobby.hostLeftTitle'),
                  t('lobby.hostLeftMessage'),
                  [{ text: t('lobby.ok'), onPress: () => router.replace('/setup') }],
                );
              } else if (data.code === 'APP_OUTDATED') {
                // No amount of retrying fixes "update the app".
                fatalRef.current = true;
                setErrorMsg(wsErrorText(data.code, data.message));
                setStatus('error');
              } else if (data.code === 'INVALID_TOKEN' || data.code === 'ROOM_NOT_FOUND') {
                forgetSeat();
                if (data.code === 'ROOM_NOT_FOUND') setRoomGone(true);
                // INVALID_TOKEN: room alive, seat stale — one silent re-join.
                // ROOM_NOT_FOUND: room gone, always terminal.
                const canRejoin =
                  data.code === 'INVALID_TOKEN' &&
                  params.action !== 'create' &&
                  !triedRejoinRef.current &&
                  !!(roomIdRef.current || params.roomCode);
                if (canRejoin) {
                  triedRejoinRef.current = true;
                  connectWebSocket();
                } else {
                  fatalRef.current = true;
                  setErrorMsg(wsErrorText(data.code, data.message));
                  setStatus('error');
                }
              } else if (data.code === 'INVALID_MESSAGE' && statusRef.current === 'waiting') {
                // Server too old to know `ping`: stop pinging, keep the lobby.
                setPingsEnabled(false);
              } else {
                setErrorMsg(wsErrorText(data.code, data.message));
                setStatus('error');
              }
              break;
          }
        } catch {
          setErrorMsg(t('game.syncError'));
          setStatus('error');
        }
      };

      ws.onerror = () => {
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        if (!gameStartedRef.current) scheduleReconnectRef.current();
      };

      ws.onclose = () => {
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        if (!gameStartedRef.current) scheduleReconnectRef.current();
      };
    } catch {
      setErrorMsg(t('lobby.cannotConnect'));
      setStatus('error');
    }
  }, [params, teardownSocket, dismissIdleWarning, forgetSeat]);

  const scheduleReconnect = useCallback(() => {
    if (fatalRef.current || gameStartedRef.current) return;
    if (reconnectTimerRef.current) return; // one already in flight
    if (disconnectedAtRef.current == null) disconnectedAtRef.current = Date.now();

    // A connection that never came up has no room to protect: fail fast.
    if (!everJoinedRef.current) {
      setIsReconnecting(false);
      setErrorMsg(t('lobby.connectionFailed'));
      setStatus('error');
      return;
    }

    const delay = nextReconnectDelay(
      reconnectAttemptRef.current,
      disconnectedAtRef.current,
      LOBBY_DISCONNECT_GRACE_MS,
    );
    if (delay == null) {
      setIsReconnecting(false);
      setErrorMsg(t('lobby.disconnected'));
      setStatus('error');
      return;
    }
    reconnectAttemptRef.current += 1;
    setIsReconnecting(true);
    setStatus(prev => (prev === 'error' ? 'connecting' : prev));
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectWebSocket();
    }, delay);
  }, [connectWebSocket]);
  scheduleReconnectRef.current = scheduleReconnect;

  const { notePong } = useSocketLiveness({
    getSocket: () => wsRef.current,
    onDead: () => {
      // Close, so exactly one place decides to retry.
      const ws = wsRef.current;
      if (ws) { try { ws.close(); } catch { /* already gone */ } }
      else scheduleReconnectRef.current();
    },
    enabled: pingsEnabled && status === 'waiting',
  });
  const notePongRef = useRef(notePong);
  notePongRef.current = notePong;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (params.action === 'rematch') {
        const handed = takeGameWs();
        try {
          const seeded = JSON.parse(params.lobbyState || '{}') as Partial<ServerMessage & { type: 'room_joined' }>;
          if (seeded.roomCode) {
            setRoomId(seeded.roomCode);
            roomIdRef.current = seeded.roomCode;
          }
          if (seeded.playerId) {
            setMyId(seeded.playerId);
            myIdRef.current = seeded.playerId;
          }
          if (seeded.reconnectToken) reconnectTokenRef.current = seeded.reconnectToken;
          if (seeded.hostId) { setHostId(seeded.hostId); hostIdRef.current = seeded.hostId; }
          if (seeded.maxPlayers) { setMaxPlayers(seeded.maxPlayers); maxPlayersRef.current = seeded.maxPlayers; }
          if (seeded.players) setPlayers(seeded.players);
          didCreateRef.current = true;
          everJoinedRef.current = true;
          if (handed?.ws) setStatus('waiting');
        } catch {
          // Fall through to a normal connect below.
        }
        if (cancelled) return;
        connectWebSocket(handed?.ws);
        // The handoff has a handler-less window, so re-ask for the roster.
        if (handed?.ws) {
          try {
            handed.ws.send(JSON.stringify(
              { type: 'rematch', playerName: params.playerName } satisfies ClientMessage,
            ));
          } catch {
            // Socket died mid-handoff; the reconnect path takes it from here.
          }
        }
        return;
      }
      if (params.action === 'resume') {
        // Seed identity from storage so onopen takes the `reconnect` branch.
        const saved = await loadRoomSession();
        if (cancelled) return;
        if (!saved) {
          setErrorMsg(t('lobby.sessionExpired'));
          setStatus('error');
          return;
        }
        setRoomId(saved.roomCode);
        roomIdRef.current = saved.roomCode;
        setMyId(saved.playerId);
        myIdRef.current = saved.playerId;
        reconnectTokenRef.current = saved.reconnectToken;
        setMaxPlayers(saved.maxPlayers);
        maxPlayersRef.current = saved.maxPlayers;
        didCreateRef.current = true; // a resume must never mint a new room
      }
      if (!cancelled) connectWebSocket();
    })();

    return () => {
      cancelled = true;
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // Mount-once: re-running on connectWebSocket changes would tear down and
    // re-open the live socket, kicking the player off the lobby.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only a host can act on a room that is gone; everyone else is stuck.
  const strandedOnDeadRoom = roomGone && params.action !== 'create';

  const goToRoomList = useCallback(() => {
    // replace, not push: the dead lobby must not be reachable with Back.
    router.replace({ pathname: '/lobby-browser', params: { playerName: params.playerName } });
  }, [params.playerName]);

  useEffect(() => {
    if (!strandedOnDeadRoom) {
      setRedirectIn(null);
      return;
    }
    let left = LOBBY_GONE_REDIRECT_SECONDS;
    setRedirectIn(left);
    const id = setInterval(() => {
      left -= 1;
      setRedirectIn(left);
      if (left <= 0) {
        clearInterval(id);
        goToRoomList();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [strandedOnDeadRoom, goToRoomList]);

  const handleStartGame = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN && players.length >= 2) {
      dismissIdleWarning();
      wsRef.current.send(JSON.stringify({ type: 'start_game' } satisfies ClientMessage));
    }
  };

  /** "We're still here" — buys another idle window from the server. */
  const handleStayInLobby = () => {
    dismissIdleWarning();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stay_in_lobby' } satisfies ClientMessage));
    }
  };

  const switchTeam = (team: 0 | 1) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'switch_team', team } satisfies ClientMessage));
    }
  };

  // Prefer the server's answer: the nav param is wrong after a resume.
  const isHost = hostId ? hostId === myId : params.action === 'create';
  const canStart = isHost && players.length >= maxPlayers;
  const hostRowId = hostId || players[0]?.id;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      {/* A 2v2 waiting room is two team headers, four player rows, the room
          code card and the Start button — more than a small phone can show at
          once, and the host's Start button is the last thing in the column.
          `flexGrow: 1` preserves the tall-screen layout: the connecting and
          error states still centre themselves, and the spacer below still
          pushes Start to the bottom. */}
      <ScrollView
        contentContainerStyle={[styles.content, {
          paddingTop: topPadding + 16,
          paddingBottom: bottomPadding + 20,
          paddingHorizontal: contentPadding,
        }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.backButton} onPress={() => {
          // Leaving on purpose: drop the stored session.
          fatalRef.current = true;
          void clearRoomSession();
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          teardownSocket();
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
            {strandedOnDeadRoom ? (
              // Nothing retryable here; the countdown is on the button itself.
              <Pressable
                style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
                onPress={goToRoomList}
                testID="lobby-back-btn"
              >
                <Text style={styles.retryText}>
                  {redirectIn && redirectIn > 0
                    ? t('lobby.backToRoomsIn', { seconds: redirectIn })
                    : t('lobby.backToRooms')}
                </Text>
              </Pressable>
            ) : (
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
              onPress={() => {
                setStatus('connecting');
                setErrorMsg('');
                setRoomGone(false);
                gameStartedRef.current = false;
                fatalRef.current = false;
                disconnectedAtRef.current = null;
                reconnectAttemptRef.current = 0;
                triedRejoinRef.current = false;
                // No token means no seat left: let a host create a fresh room.
                if (!reconnectTokenRef.current) {
                  didCreateRef.current = false;
                  if (params.action === 'create') roomIdRef.current = '';
                }
                connectWebSocket();
              }}
            >
              <Text style={styles.retryText}>{t('lobby.tryAgain')}</Text>
            </Pressable>
            )}
          </View>
        )}

        {status === 'waiting' && isReconnecting && (
          <View style={styles.reconnectBanner}>
            <ActivityIndicator size="small" color={Colors.gold} />
            <Text style={styles.reconnectText}>{t('lobby.reconnecting')}</Text>
          </View>
        )}

        {status === 'waiting' && (
          <>
            <View style={styles.roomCodeCard}>
              <Text style={styles.roomCodeLabel}>{t('lobby.roomCode')}</Text>
              <Text style={styles.roomCode}>{roomId}</Text>
              <Text style={styles.roomCodeHint}>{t('lobby.shareCode')}</Text>
              {params.action === 'create' && (
                <Pressable style={styles.shareBtn} onPress={handleShare}>
                  <MaterialCommunityIcons name="share-variant" size={16} color={Colors.textDark} />
                  <Text style={styles.shareBtnText}>{t('lobby.shareInvite')}</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.playersSection}>
              <Text style={styles.sectionLabel}>
                {t('lobby.players', { current: players.length, max: maxPlayers })}
              </Text>

              {maxPlayers === 4 ? (
                ([0, 1] as const).map((teamIdx) => {
                  const teamPlayers = players.filter(p => p.team === teamIdx);
                  const emptySlots = 2 - teamPlayers.length;
                  const myPlayer = players.find(p => p.id === myId);
                  const canJoinThisTeam = myPlayer?.team !== teamIdx;
                  return (
                    <View key={teamIdx}>
                      <Text style={styles.teamHeader}>
                        {t(teamIdx === 0 ? 'lobby.team1' : 'lobby.team2')}
                      </Text>
                      {teamPlayers.map((p) => (
                        <View key={p.id} style={[styles.playerRow, p.connected === false && styles.playerRowAway]}>
                          <View style={styles.playerAvatar}>
                            <MaterialCommunityIcons
                              name={p.id === hostRowId ? 'crown' : 'account'}
                              size={18}
                              color={p.id === hostRowId ? Colors.gold : Colors.textSecondary}
                            />
                          </View>
                          <Text style={styles.playerName}>{p.name}</Text>
                                          {p.connected === false && (
                            <Text style={styles.awayText}>{t('lobby.playerReconnecting')}</Text>
                          )}
                          {p.id === myId && (
                            <View style={styles.youBadge}>
                              <Text style={styles.youText}>{t('lobby.you')}</Text>
                            </View>
                          )}
                          {p.id === hostRowId && (
                            <View style={styles.hostBadge}>
                              <Text style={styles.hostText}>{t('lobby.host')}</Text>
                            </View>
                          )}
                        </View>
                      ))}
                      {Array.from({ length: emptySlots }).map((_, i) => (
                        <Pressable
                          key={`empty-${teamIdx}-${i}`}
                          style={[styles.playerRow, styles.emptySlot, canJoinThisTeam && styles.emptySlotTappable]}
                          onPress={() => canJoinThisTeam && switchTeam(teamIdx)}
                          disabled={!canJoinThisTeam}
                        >
                          <View style={[styles.playerAvatar, styles.emptyAvatar]}>
                            <MaterialCommunityIcons
                              name="account-plus"
                              size={18}
                              color={canJoinThisTeam ? Colors.gold : Colors.textSecondary}
                            />
                          </View>
                          <Text style={[styles.emptyText, canJoinThisTeam && { color: Colors.gold }]}>
                            {canJoinThisTeam ? t('lobby.joinTeam') : t('lobby.waitingPlayer')}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })
              ) : (
                <>
                  {players.map((p) => (
                    <View key={p.id} style={[styles.playerRow, p.connected === false && styles.playerRowAway]}>
                      <View style={styles.playerAvatar}>
                        <MaterialCommunityIcons
                          name={p.id === hostRowId ? 'crown' : 'account'}
                          size={18}
                          color={p.id === hostRowId ? Colors.gold : Colors.textSecondary}
                        />
                      </View>
                      <Text style={styles.playerName}>{p.name}</Text>
                      {/* Explicitly false, not falsy: a server that predates
                          presence omits the field entirely. */}
                      {p.connected === false && (
                        <Text style={styles.awayText}>{t('lobby.playerReconnecting')}</Text>
                      )}
                      {p.id === myId && (
                        <View style={styles.youBadge}>
                          <Text style={styles.youText}>{t('lobby.you')}</Text>
                        </View>
                      )}
                      {p.id === hostRowId && (
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
                </>
              )}
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
      </ScrollView>

      <Modal visible={showIdleWarning} transparent animationType="fade">
        <View style={styles.idleBackdrop}>
          <View style={styles.idleCard}>
            <MaterialCommunityIcons name="timer-sand" size={36} color={Colors.gold} />
            <Text style={styles.idleTitle}>{t('lobby.stillThereTitle')}</Text>
            <Text style={styles.idleBody}>
              {isHost
                ? t('lobby.stillThereHost', { seconds: idleSecondsLeft })
                : t('lobby.stillThereGuest', { seconds: idleSecondsLeft })}
            </Text>
            <View style={styles.idleActions}>
              {isHost && canStart && (
                <Pressable
                  style={({ pressed }) => [styles.idlePrimary, pressed && { opacity: 0.85 }]}
                  onPress={handleStartGame}
                  testID="idle-start-btn"
                >
                  <Text style={styles.idlePrimaryText}>{t('lobby.startGame')}</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.idleSecondary, pressed && { opacity: 0.85 }]}
                onPress={handleStayInLobby}
                testID="idle-stay-btn"
              >
                <Text style={styles.idleSecondaryText}>{t('lobby.stillThereStay')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
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
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, backgroundColor: Colors.gold,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    alignSelf: 'center',
  },
  shareBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textDark },
  playersSection: {
    gap: 8,
  },
  teamHeader: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 6,
  },
  emptySlotTappable: {
    borderColor: Colors.gold,
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
  playerRowAway: {
    opacity: 0.55,
  },
  idleBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  idleCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.backgroundDark,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.gold,
    padding: 24,
  },
  idleTitle: {
    color: Colors.gold,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  idleBody: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  idleActions: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 4,
  },
  idlePrimary: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  idlePrimaryText: {
    color: Colors.textDark,
    fontSize: 15,
    fontWeight: '700',
  },
  idleSecondary: {
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  idleSecondaryText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  awayText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontStyle: 'italic',
  },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.whiteAlpha,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  reconnectText: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '600',
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
