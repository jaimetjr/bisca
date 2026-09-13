import { WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { Room } from './models/room';
import { GameState } from '../shared/lib/types';
import { completeTrick, createGameState, isLegalPlay, playCard } from '../shared/lib/brisca/engine';
import {
  ServerMessage,
  RoomPlayerInfo,
  PublicRoomInfo,
} from '../shared/lib/types/messages';
import {
  TRICK_DISPLAY_MS,
  ROOM_CODE_LENGTH,
  ROOM_EXPIRY_MS,
  ROOM_CLEANUP_AFTER_GAME_MS,
  AFK_TIMEOUT_MS,
  AFK_WARNING_MS,
  GAME_WIN_SCORE,
  LOBBY_DISCONNECT_GRACE_MS,
  LOBBY_IDLE_TIMEOUT_MS,
  LOBBY_IDLE_WARNING_MS,
} from '../shared/constants/game';
import {
  clientMessageSchema,
  type ValidatedClientMessage,
} from '../shared/lib/validation/client-messages';
import { compareVersions } from '../shared/lib/version';
import { issueReconnectToken, verifyReconnectToken } from './lib/reconnect-token';
import { createRoomLimiter, messageLimiter, envInt } from './lib/rate-limit';
import { logger } from './lib/logger';
import { getRoomStore } from './stores';

const log = logger.child({ module: 'game-rooms' });
import {
  attachConnection,
  detachByWs,
  getLocation,
  getWsForPlayer,
} from './connections/registry';

const roomAfkTimers = new Map<string, ReturnType<typeof setTimeout>>();
const roomAfkWarnTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Keyed by room code — a room has exactly one host. */
const lobbyDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lobbyIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lobbyIdleWarnTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Post-match delete timers, tracked so a rematch can call them off. */
const roomCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const wsClientIp = new WeakMap<WebSocket, string>();

// Read per call so tests and Railway can override it.
function lobbyGraceMs(): number {
  return envInt('LOBBY_GRACE_MS', LOBBY_DISCONNECT_GRACE_MS);
}

function clearLobbyTimer(roomCode: string) {
  const t = lobbyDisconnectTimers.get(roomCode);
  if (t) { clearTimeout(t); lobbyDisconnectTimers.delete(roomCode); }
}

function afkTimeoutMs(): number {
  return envInt('AFK_TIMEOUT_MS', AFK_TIMEOUT_MS);
}

function afkWarningMs(): number {
  return Math.min(envInt('AFK_WARNING_MS', AFK_WARNING_MS), afkTimeoutMs());
}

function lobbyIdleMs(): number {
  return envInt('LOBBY_IDLE_MS', LOBBY_IDLE_TIMEOUT_MS);
}

function lobbyIdleWarnMs(): number {
  return envInt('LOBBY_IDLE_WARNING_MS', LOBBY_IDLE_WARNING_MS);
}

/** Tracked so a rematch can cancel it and reuse the room. */
function scheduleRoomCleanup(roomCode: string) {
  clearRoomCleanup(roomCode);
  const delay = envInt('ROOM_CLEANUP_MS', ROOM_CLEANUP_AFTER_GAME_MS);
  roomCleanupTimers.set(roomCode, setTimeout(() => {
    roomCleanupTimers.delete(roomCode);
    void getRoomStore().delete(roomCode).catch(err => log.error({ err }, 'room-cleanup error'));
  }, delay));
}

function clearRoomCleanup(roomCode: string) {
  const t = roomCleanupTimers.get(roomCode);
  if (t) { clearTimeout(t); roomCleanupTimers.delete(roomCode); }
}

function clearLobbyIdle(roomCode: string) {
  const t = lobbyIdleTimers.get(roomCode);
  if (t) { clearTimeout(t); lobbyIdleTimers.delete(roomCode); }
  const w = lobbyIdleWarnTimers.get(roomCode);
  if (w) { clearTimeout(w); lobbyIdleWarnTimers.delete(roomCode); }
}

/** Armed only when every seat is taken: a room still filling up is not idle. */
function scheduleLobbyIdle(room: Room) {
  clearLobbyIdle(room.code);
  if (room.status !== 'waiting' || room.players.length < room.maxPlayers) return;

  const roomCode = room.code;
  const total = lobbyIdleMs();
  const lead = Math.min(lobbyIdleWarnMs(), total);

  lobbyIdleWarnTimers.set(roomCode, setTimeout(async () => {
    lobbyIdleWarnTimers.delete(roomCode);
    try {
      const fresh = await getRoomStore().get(roomCode);
      if (!fresh || fresh.status !== 'waiting' || fresh.players.length < fresh.maxPlayers) return;
      broadcast(fresh, { type: 'afk_warning', secondsLeft: Math.round(lead / 1000) });
    } catch (err) {
      log.error({ err }, 'lobby-idle-warn error');
    }
  }, total - lead));

  lobbyIdleTimers.set(roomCode, setTimeout(async () => {
    lobbyIdleTimers.delete(roomCode);
    try {
      const store = getRoomStore();
      const fresh = await store.get(roomCode);
      if (!fresh || fresh.status !== 'waiting' || fresh.players.length < fresh.maxPlayers) return;
      broadcast(fresh, {
        type: 'error',
        message: 'This room closed because the game was never started.',
        code: 'LOBBY_IDLE',
      });
      clearLobbyIdle(roomCode);
      await store.delete(roomCode);
    } catch (err) {
      log.error({ err }, 'lobby-idle-close error');
    }
  }, total));
}

// ─── Minimum app version ─────────────────────────────────────────────────────

const VERSION_PATTERN = /^\d+(\.\d+)*$/;
let warnedFloor: string | null = null;

/**
 * The oldest app build allowed into a room, from MIN_APP_VERSION.
 *
 * Read per call rather than at import so raising the floor is a Railway env
 * change plus a restart, with no code deploy — and so tests can move it.
 *
 * Two deliberate fail-open choices, both for the same reason (a mistake here
 * locks every player out of multiplayer, which is worse than the incompatible
 * client it guards against):
 *   - unset  → '0.0.0', letting everyone in. That is how this ships.
 *   - garbage → '0.0.0' plus a warning, instead of blocking the world over a typo.
 */
function minAppVersion(): string {
  const raw = process.env.MIN_APP_VERSION?.trim();
  if (!raw) return '0.0.0';
  if (!VERSION_PATTERN.test(raw)) {
    if (warnedFloor !== raw) {
      warnedFloor = raw;
      log.warn({ MIN_APP_VERSION: raw }, 'MIN_APP_VERSION is not a version — version gate disabled');
    }
    return '0.0.0';
  }
  return raw;
}

/**
 * Turn away a client too old for the current protocol. Returns true when it
 * did, in which case the caller must stop.
 *
 * The `message` matters as much as the code: builds shipped before this gate
 * existed do not know APP_OUTDATED and fall back to showing this sentence
 * verbatim (see wsErrorText in shared/lib/api-errors.ts).
 */
function rejectOutdatedApp(ws: WebSocket, appVersion: string | undefined): boolean {
  const floor = minAppVersion();
  if (compareVersions(appVersion, floor) >= 0) return false;
  log.info({ appVersion: appVersion ?? 'none', floor }, 'rejected outdated client');
  sendTo(ws, {
    type: 'error',
    message: 'Please update Bisca to keep playing online.',
    code: 'APP_OUTDATED',
  });
  return true;
}

function clientIpFor(ws: WebSocket): string {
  return wsClientIp.get(ws) ?? 'unknown';
}

function clientIpFromRequest(request: IncomingMessage): string {
  const fwd = request.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return request.socket.remoteAddress ?? 'unknown';
}

// ─── Room expiry cleanup ──────────────────────────────────────────────────────

setInterval(async () => {
  try {
    const store = getRoomStore();
    const all = await store.list();
    const now = Date.now();
    for (const room of all) {
      if (now - room.lastActivityAt > ROOM_EXPIRY_MS) {
        for (const p of room.players) {
          const ws = getWsForPlayer(p.id);
          if (ws) sendTo(ws, { type: 'error', message: 'Room expired due to inactivity', code: 'ROOM_NOT_FOUND' });
        }
        clearAfkTimer(room.code);
        clearLobbyIdle(room.code);
        await store.delete(room.code);
      }
    }
  } catch (err) {
    log.error({ err }, 'room-cleanup error');
  }
}, 60_000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function broadcast(room: Room, message: ServerMessage, excludePlayerId?: string) {
  const msg = JSON.stringify(message);
  for (const player of room.players) {
    if (excludePlayerId && player.id === excludePlayerId) continue;
    const ws = getWsForPlayer(player.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function sendTo(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function getPlayerList(room: Room): RoomPlayerInfo[] {
  return room.players.map(p => ({
    id: p.id,
    name: p.name,
    team: p.team,
    connected: p.disconnectedAt == null,
  }));
}

/** The emptier side in a 4-player room, so a rematch seat lands evenly. */
function balancedTeam(room: Room): 0 | 1 {
  const t0 = room.players.filter(p => p.team === 0).length;
  const t1 = room.players.filter(p => p.team === 1).length;
  return t0 <= t1 ? 0 : 1;
}

function touchRoom(room: Room) {
  room.lastActivityAt = Date.now();
}

function broadcastPlayerViews(room: Room, state: GameState, msgType: 'game_start' | 'game_update') {
  for (const player of room.players) {
    const ws = getWsForPlayer(player.id);
    if (!ws) continue;
    const view = createPlayerView(state, player.id);
    if (msgType === 'game_start') {
      sendTo(ws, { type: 'game_start', gameState: view, playerId: player.id });
    } else {
      sendTo(ws, { type: 'game_update', gameState: view });
    }
  }
}

// ─── AFK helpers ─────────────────────────────────────────────────────────────

function clearAfkTimer(roomCode: string) {
  const t = roomAfkTimers.get(roomCode);
  if (t) { clearTimeout(t); roomAfkTimers.delete(roomCode); }
  const w = roomAfkWarnTimers.get(roomCode);
  if (w) { clearTimeout(w); roomAfkWarnTimers.delete(roomCode); }
}

function forfeitGame(state: GameState, afkPlayerId: string): GameState {
  const next = structuredClone(state) as GameState;
  next.phase = 'gameOver';
  next.endReason = 'forfeit';
  const afkPlayer = next.players.find(p => p.id === afkPlayerId);
  next.forfeitedBy = afkPlayer?.name;
  const winningPlayers = next.players.filter(p =>
    afkPlayer?.team !== undefined ? p.team !== afkPlayer.team : p.id !== afkPlayerId
  );
  // Award all 120 points split evenly among winners
  const winScore = Math.floor(120 / winningPlayers.length);
  next.players.forEach(p => {
    const loses = afkPlayer?.team !== undefined
      ? p.team === afkPlayer.team
      : p.id === afkPlayerId;
    p.score = loses ? 0 : winScore;
  });
  return next;
}

function scheduleAfkTimer(room: Room, state: GameState) {
  if (state.phase !== 'playing') return;
  clearAfkTimer(room.code);
  const afkPlayerId = state.players[state.currentPlayerIndex].id;
  const roomCode = room.code;

  roomAfkWarnTimers.set(roomCode, setTimeout(async () => {
    try {
      const store = getRoomStore();
      const fresh = await store.get(roomCode);
      if (!fresh?.gameState || fresh.gameState.phase !== 'playing') return;
      const curr = fresh.gameState.players[fresh.gameState.currentPlayerIndex];
      if (curr.id !== afkPlayerId) return;
      const ws = getWsForPlayer(afkPlayerId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendTo(ws, {
          type: 'afk_warning',
          secondsLeft: Math.round(afkWarningMs() / 1000),
          playerId: afkPlayerId,
        });
      }
    } catch (err) {
      log.error({ err }, 'afk-warn error');
    }
  }, afkTimeoutMs() - afkWarningMs()));

  roomAfkTimers.set(roomCode, setTimeout(async () => {
    try {
      const store = getRoomStore();
      const fresh = await store.get(roomCode);
      if (!fresh?.gameState || fresh.gameState.phase !== 'playing') return;
      const curr = fresh.gameState.players[fresh.gameState.currentPlayerIndex];
      if (curr.id !== afkPlayerId) return;
      fresh.gameState = forfeitGame(fresh.gameState, afkPlayerId);
      fresh.status = 'finished';
      touchRoom(fresh);
      await store.set(fresh);
      broadcastPlayerViews(fresh, fresh.gameState, 'game_update');
      clearAfkTimer(roomCode);
      scheduleRoomCleanup(roomCode);
    } catch (err) {
      log.error({ err }, 'afk-forfeit error');
    }
  }, afkTimeoutMs()));
}

// ─── WebSocket entry point ────────────────────────────────────────────────────

export function handleWebSocket(ws: WebSocket, request?: IncomingMessage) {
  if (request) {
    wsClientIp.set(ws, clientIpFromRequest(request));
  }

  ws.on('message', (raw) => {
    if (!messageLimiter.take(ws)) {
      sendTo(ws, { type: 'error', message: 'Rate limit exceeded', code: 'RATE_LIMITED' });
      try { ws.close(1008, 'rate limited'); } catch { /* noop */ }
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      sendTo(ws, { type: 'error', message: 'Invalid message format', code: 'INVALID_MESSAGE' });
      return;
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      sendTo(ws, { type: 'error', message: 'Invalid message payload', code: 'INVALID_MESSAGE' });
      return;
    }
    void handleMessage(ws, result.data).catch((err) => {
      log.error({ err }, 'ws-handler error');
      sendTo(ws, { type: 'error', message: 'Internal error', code: 'INVALID_MESSAGE' });
    });
  });

  // An 'error' event with no listener throws and kills the process.
  ws.on('error', (err: Error) => {
    log.warn({ code: (err as NodeJS.ErrnoException).code, msg: err.message }, 'ws socket error');
  });

  ws.on('close', () => {
    void handleClose(ws).catch((err) => log.error({ err }, 'ws-close error'));
  });
}

async function handleClose(ws: WebSocket) {
  const loc = detachByWs(ws);
  if (!loc) return;
  const store = getRoomStore();
  const room = await store.get(loc.roomCode);
  if (!room) return;

  touchRoom(room);
  const leavingId = loc.playerId;

  if (room.status === 'waiting') {
    if (room.hostId !== leavingId) {
      // Non-hosts go immediately, or the room reads as fuller than it is.
      room.players = room.players.filter(p => p.id !== leavingId);
      if (room.players.length === 0) {
        clearLobbyTimer(room.code);
        clearLobbyIdle(room.code);
        await store.delete(room.code);
        return;
      }
      await store.set(room);
      // No longer full, so it is waiting for people again, not idling.
      clearLobbyIdle(room.code);
      broadcast(room, { type: 'player_left', players: getPlayerList(room) });
      return;
    }

    // The host keeps its seat: the code they just shared must still work.
    const host = room.players.find(p => p.id === leavingId);
    if (!host) return;
    host.disconnectedAt = Date.now();
    await store.set(room);
    // player_left reused so older builds still re-render; nobody has left.
    broadcast(room, { type: 'player_left', players: getPlayerList(room) }, leavingId);

    clearLobbyTimer(room.code);
    lobbyDisconnectTimers.set(room.code, setTimeout(() => {
      void expireLobbyGrace(room.code).catch(err => log.error({ err }, 'lobby-grace error'));
    }, lobbyGraceMs()));
    return;
  }

  if (room.status === 'playing') {
    // Not a forfeit. Once the turn reaches them the AFK clock applies.
    const gone = room.players.find(p => p.id === leavingId);
    if (gone) gone.disconnectedAt = Date.now();
    await store.set(room);
    broadcast(room, { type: 'presence', playerId: leavingId, connected: false }, leavingId);
  }
}

/** Advisory: every condition is re-read, never trusted from the closure. */
async function expireLobbyGrace(roomCode: string) {
  lobbyDisconnectTimers.delete(roomCode);
  const store = getRoomStore();
  const room = await store.get(roomCode);
  if (!room || room.status !== 'waiting') return;

  const host = room.players.find(p => p.id === room.hostId);
  if (!host || host.disconnectedAt == null) return;              // reconnected
  const remaining = host.disconnectedAt + lobbyGraceMs() - Date.now();
  if (remaining > 0) {
    // Re-arm rather than return, or the room is left with no pending timer.
    lobbyDisconnectTimers.set(roomCode, setTimeout(() => {
      void expireLobbyGrace(roomCode).catch(err => log.error({ err }, 'lobby-grace error'));
    }, remaining));
    return;
  }
  const hostWs = getWsForPlayer(room.hostId);
  if (hostWs && hostWs.readyState === WebSocket.OPEN) return;    // live socket

  broadcast(room, { type: 'error', message: 'The host left the room', code: 'HOST_LEFT' });
  clearLobbyIdle(roomCode);
  await store.delete(roomCode);
}

// ─── Message handler ──────────────────────────────────────────────────────────

async function handleMessage(ws: WebSocket, data: ValidatedClientMessage) {
  const store = getRoomStore();

  switch (data.type) {
    // No touchRoom(): liveness is not activity.
    case 'ping': {
      sendTo(ws, { type: 'pong' });
      break;
    }

    case 'rematch': {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room) {
        sendTo(ws, { type: 'error', message: 'Room no longer exists', code: 'ROOM_NOT_FOUND' });
        return;
      }
      const isHost = loc.playerId === room.hostId;

      if (room.status === 'finished') {
        // Only the host rebuilds; anyone else waits for rematch_ready below.
        if (!isHost) return;

        const formerPlayerIds = room.players.map(p => p.id);
        clearRoomCleanup(room.code);
        room.status = 'waiting';
        room.gameState = null;
        // Seats reopen: a player who quit must not hold one.
        room.players = room.players
          .filter(p => p.id === room.hostId)
          .map(p => ({ ...p, disconnectedAt: undefined }));
        touchRoom(room);
        await store.set(room);

        sendTo(ws, {
          type: 'room_joined',
          roomCode: room.code,
          playerId: loc.playerId,
          reconnectToken: issueReconnectToken(loc.playerId, room.code),
          players: getPlayerList(room),
          maxPlayers: room.maxPlayers,
          hostId: room.hostId,
        });

        // These players are off room.players, so broadcast() would miss them.
        for (const pid of formerPlayerIds) {
          if (pid === room.hostId) continue;
          const target = getWsForPlayer(pid);
          if (target) sendTo(target, { type: 'rematch_ready', roomCode: room.code });
        }
        return;
      }

      if (room.status !== 'waiting') return;

      // The room is already rebuilt — take a seat in it.
      const alreadySeated = room.players.some(p => p.id === loc.playerId);
      if (!alreadySeated) {
        if (room.players.length >= room.maxPlayers) {
          sendTo(ws, { type: 'error', message: 'Room is full', code: 'ROOM_FULL' });
          return;
        }
        room.players.push({
          id: loc.playerId,
          name: data.playerName || 'Player',
          team: room.maxPlayers === 4 ? balancedTeam(room) : undefined,
        });
      }
      touchRoom(room);
      await store.set(room);

      sendTo(ws, {
        type: 'room_joined',
        roomCode: room.code,
        playerId: loc.playerId,
        reconnectToken: issueReconnectToken(loc.playerId, room.code),
        players: getPlayerList(room),
        maxPlayers: room.maxPlayers,
        hostId: room.hostId,
      });
      if (!alreadySeated) {
        broadcast(room, { type: 'player_joined', players: getPlayerList(room) }, loc.playerId);
      }
      scheduleLobbyIdle(room);
      return;
    }

    case 'still_here': {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room?.gameState || room.gameState.phase !== 'playing') return;
      // Only the player on the clock may reset it.
      const current = room.gameState.players[room.gameState.currentPlayerIndex];
      if (current.id !== loc.playerId) return;
      touchRoom(room);
      await store.set(room);
      scheduleAfkTimer(room, room.gameState);
      break;
    }

    case 'stay_in_lobby': {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room || room.status !== 'waiting') return;
      touchRoom(room);
      await store.set(room);
      scheduleLobbyIdle(room);
      break;
    }

    case 'create_room': {
      // Before the rate limiter: an outdated client should not burn someone
      // else's budget, and "update the app" is the more useful answer anyway.
      if (rejectOutdatedApp(ws, data.appVersion)) return;

      if (!createRoomLimiter.take(clientIpFor(ws))) {
        sendTo(ws, { type: 'error', message: 'Too many rooms created — try again shortly', code: 'RATE_LIMITED' });
        return;
      }

      // Generate a unique code, retrying on collision
      let code = generateRoomCode();
      const playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const playerName = data.playerName || 'Host';
      const maxPlayers = Math.min(4, Math.max(2, data.maxPlayers || 2));
      let stored = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate: Room = {
          code,
          hostId: playerId,
          hostName: playerName,
          maxPlayers,
          players: [{ id: playerId, name: playerName, team: maxPlayers === 4 ? 0 : undefined }],
          gameState: null,
          status: 'waiting',
          isPublic: data.isPublic !== false,
          lastActivityAt: Date.now(),
          strictFollowSuit: data.strictFollowSuit === true,
        };
        if (await store.setIfAbsent(candidate)) {
          stored = true;
          attachConnection(ws, playerId, code);
          sendTo(ws, {
            type: 'room_created',
            roomCode: code,
            playerId,
            reconnectToken: issueReconnectToken(playerId, code),
            players: getPlayerList(candidate),
            maxPlayers: candidate.maxPlayers,
            hostId: candidate.hostId,
          });
          break;
        }
        code = generateRoomCode();
      }
      if (!stored) {
        sendTo(ws, { type: 'error', message: 'Failed to allocate room', code: 'INVALID_MESSAGE' });
      }
      break;
    }

    case 'join_room': {
      if (rejectOutdatedApp(ws, data.appVersion)) return;

      const room = await store.get(data.roomCode?.toUpperCase());
      if (!room) {
        sendTo(ws, { type: 'error', message: 'Room not found', code: 'ROOM_NOT_FOUND' });
        return;
      }
      if (room.status !== 'waiting') {
        sendTo(ws, { type: 'error', message: 'Game already in progress', code: 'GAME_ALREADY_STARTED' });
        return;
      }
      if (room.players.length >= room.maxPlayers) {
        sendTo(ws, { type: 'error', message: 'Room is full', code: 'ROOM_FULL' });
        return;
      }

      const playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

      let team: 0 | 1 | undefined;
      if (room.maxPlayers === 4) {
        const t0Count = room.players.filter(p => p.team === 0).length;
        const t1Count = room.players.filter(p => p.team === 1).length;
        if (data.preferredTeam !== undefined && (data.preferredTeam === 0 ? t0Count : t1Count) < 2) {
          team = data.preferredTeam;
        } else {
          team = t0Count <= t1Count ? 0 : 1;
        }
      }

      room.players.push({ id: playerId, name: data.playerName || 'Player', team });
      touchRoom(room);
      await store.set(room);
      attachConnection(ws, playerId, room.code);

      sendTo(ws, {
        type: 'room_joined',
        roomCode: room.code,
        playerId,
        reconnectToken: issueReconnectToken(playerId, room.code),
        players: getPlayerList(room),
        maxPlayers: room.maxPlayers,
        hostId: room.hostId,
      });

      broadcast(room, { type: 'player_joined', players: getPlayerList(room) }, playerId);
      // Everyone has arrived: start the clock on actually pressing Start.
      scheduleLobbyIdle(room);
      break;
    }

    case 'switch_team': {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room || room.status !== 'waiting' || room.maxPlayers !== 4) return;
      const player = room.players.find(p => p.id === loc.playerId);
      if (!player) return;
      const targetCount = room.players.filter(p => p.team === data.team).length;
      if (targetCount >= 2) {
        sendTo(ws, { type: 'error', message: 'Team is full', code: 'ROOM_FULL' });
        return;
      }
      player.team = data.team;
      touchRoom(room);
      await store.set(room);
      broadcast(room, { type: 'player_joined', players: getPlayerList(room) });
      scheduleLobbyIdle(room);
      break;
    }

    case 'start_game': {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room) return;

      if (loc.playerId !== room.hostId) {
        sendTo(ws, { type: 'error', message: 'Only the host can start the game', code: 'NOT_HOST' });
        return;
      }
      if (room.players.length < 2) {
        sendTo(ws, { type: 'error', message: 'Need at least 2 players', code: 'NEED_MORE_PLAYERS' });
        return;
      }

      const configs = room.players.map(p => ({ id: p.id, name: p.name, isAI: false, team: p.team }));
      // The lead is worth real points and used to always fall to the host.
      // Drawn per game: a rematch here sends players back to the lobby rather
      // than restarting the room, so there is no sequence to rotate through.
      const gameState = createGameState(configs, undefined, {
        startingPlayerIndex: Math.floor(Math.random() * configs.length),
      });
      room.gameState = gameState;
      room.status = 'playing';
      touchRoom(room);
      await store.set(room);

      clearLobbyIdle(room.code);
      broadcastPlayerViews(room, gameState, 'game_start');
      scheduleAfkTimer(room, gameState);
      break;
    }

    case 'reconnect': {
      // Ahead of the token check so an outdated client is told to update
      // instead of reading INVALID_TOKEN and retrying forever.
      if (rejectOutdatedApp(ws, data.appVersion)) return;

      if (!data.reconnectToken) {
        sendTo(ws, { type: 'error', message: 'Reconnect token required', code: 'INVALID_TOKEN' });
        return;
      }
      const claims = verifyReconnectToken(data.reconnectToken);
      if (!claims || claims.playerId !== data.playerId) {
        sendTo(ws, { type: 'error', message: 'Invalid or expired reconnect token', code: 'INVALID_TOKEN' });
        return;
      }

      const pid = claims.playerId;
      const room = await store.get(claims.roomCode);
      if (!room) {
        sendTo(ws, { type: 'error', message: 'Room no longer exists', code: 'ROOM_NOT_FOUND' });
        return;
      }
      const existing = room.players.find(p => p.id === pid);
      if (!existing) {
        sendTo(ws, { type: 'error', message: 'Player not found in room', code: 'INVALID_TOKEN' });
        return;
      }

      if (pid === room.hostId) clearLobbyTimer(room.code);

      attachConnection(ws, pid, room.code);
      existing.disconnectedAt = undefined;
      touchRoom(room);
      await store.set(room);
      if (room.gameState) {
        const view = createPlayerView(room.gameState, pid);
        sendTo(ws, { type: 'reconnected', gameState: view });
        broadcast(room, { type: 'presence', playerId: pid, connected: true }, pid);
        scheduleAfkTimer(room, room.gameState);
      } else if (room.status === 'waiting') {
        // A lobby has no gameState, so reply with room_joined instead.
        sendTo(ws, {
          type: 'room_joined',
          roomCode: room.code,
          playerId: pid,
          reconnectToken: issueReconnectToken(pid, room.code),
          players: getPlayerList(room),
          maxPlayers: room.maxPlayers,
          hostId: room.hostId,
        });
        broadcast(room, { type: 'player_joined', players: getPlayerList(room) }, pid);
        scheduleLobbyIdle(room);
      }
      break;
    }

    case 'leave_game': {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room || !room.gameState || room.gameState.phase === 'gameOver') return;
      const playerId = loc.playerId;
      room.gameState = forfeitGame(room.gameState, playerId);
      room.status = 'finished';
      touchRoom(room);
      await store.set(room);
      clearAfkTimer(loc.roomCode);
      broadcastPlayerViews(room, room.gameState, 'game_update');
      scheduleRoomCleanup(loc.roomCode);
      break;
    }

    case 'play_card': {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room || !room.gameState) return;

      const playerId = loc.playerId;
      const currentPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
      if (currentPlayer.id !== playerId) {
        sendTo(ws, { type: 'error', message: 'Not your turn', code: 'NOT_YOUR_TURN' });
        return;
      }

      const card = room.gameState.players
        .find(p => p.id === playerId)
        ?.hand.find(c => c.id === data.cardId);
      if (!card) {
        sendTo(ws, { type: 'error', message: 'Invalid card', code: 'INVALID_CARD' });
        return;
      }

      if (!isLegalPlay(room.gameState, playerId, card, room.strictFollowSuit === true)) {
        sendTo(ws, { type: 'error', message: 'You must follow suit', code: 'MUST_FOLLOW_SUIT' });
        return;
      }

      const newState = playCard(room.gameState, playerId, card);
      room.gameState = newState;
      touchRoom(room);
      await store.set(room);

      if (newState.phase === 'trickComplete') {
        clearAfkTimer(loc.roomCode);
        broadcastPlayerViews(room, newState, 'game_update');

        setTimeout(async () => {
          try {
            const r = await store.get(loc.roomCode);
            if (r?.gameState && r.gameState.phase === 'trickComplete') {
              r.gameState = completeTrick(r.gameState);
              touchRoom(r);
              await store.set(r);
              broadcastPlayerViews(r, r.gameState, 'game_update');

              if (r.gameState.phase === 'gameOver') {
                r.status = 'finished';
                await store.set(r);
                scheduleRoomCleanup(loc.roomCode);
              } else {
                scheduleAfkTimer(r, r.gameState);
              }
            }
          } catch (err) {
            log.error({ err }, 'trick-advance error');
          }
        }, TRICK_DISPLAY_MS);
      } else {
        broadcastPlayerViews(room, newState, 'game_update');
        scheduleAfkTimer(room, newState);
      }
      break;
    }
  }
}

// ─── View helpers ─────────────────────────────────────────────────────────────

function createPlayerView(state: GameState, playerId: string): GameState {
  const view = structuredClone(state) as GameState;
  for (const player of view.players) {
    if (player.id !== playerId) {
      player.hand = player.hand.map(() => ({
        suit: 'bastos' as const,
        rank: 1 as const,
        id: 'hidden',
      }));
    }
  }
  return view;
}

export async function getPublicRooms(): Promise<PublicRoomInfo[]> {
  const store = getRoomStore();
  const all = await store.list();
  const result: PublicRoomInfo[] = [];
  for (const room of all) {
    // A room whose host is mid-grace is not usefully joinable.
    const hostPresent = room.players.find(p => p.id === room.hostId)?.disconnectedAt == null;
    if (room.isPublic && room.status === 'waiting' && hostPresent && room.players.length < room.maxPlayers) {
      result.push({
        code: room.code,
        hostName: room.hostName,
        maxPlayers: room.maxPlayers,
        currentPlayers: room.players.length,
        mode: room.maxPlayers === 4 ? '2v2' : '1v1',
      });
    }
  }
  return result;
}
