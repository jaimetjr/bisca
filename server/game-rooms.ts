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
} from '../shared/constants/game';
import {
  clientMessageSchema,
  type ValidatedClientMessage,
} from '../shared/lib/validation/client-messages';
import { issueReconnectToken, verifyReconnectToken } from './lib/reconnect-token';
import { createRoomLimiter, messageLimiter } from './lib/rate-limit';
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
const playerDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const wsClientIp = new WeakMap<WebSocket, string>();

const DISCONNECT_GRACE_MS = 10_000; // 10s to reconnect before forfeit

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
  return room.players.map(p => ({ id: p.id, name: p.name, team: p.team }));
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
        sendTo(ws, { type: 'afk_warning', secondsLeft: AFK_WARNING_MS / 1000 });
      }
    } catch (err) {
      log.error({ err }, 'afk-warn error');
    }
  }, AFK_TIMEOUT_MS - AFK_WARNING_MS));

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
      setTimeout(() => { void store.delete(roomCode); }, ROOM_CLEANUP_AFTER_GAME_MS);
    } catch (err) {
      log.error({ err }, 'afk-forfeit error');
    }
  }, AFK_TIMEOUT_MS));
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
    room.players = room.players.filter(p => p.id !== leavingId);
    if (room.players.length === 0) {
      await store.delete(room.code);
      return;
    }
    if (room.hostId === leavingId) {
      broadcast(room, { type: 'error', message: 'The host left the room', code: 'HOST_LEFT' });
      await store.delete(room.code);
      return;
    }
    await store.set(room);
    broadcast(room, { type: 'player_left', players: getPlayerList(room) });
    return;
  }

  if (room.status === 'playing') {
    // Save the (still-touched) room before scheduling forfeit
    await store.set(room);
    playerDisconnectTimers.set(leavingId, setTimeout(async () => {
      playerDisconnectTimers.delete(leavingId);
      try {
        const r = await store.get(loc.roomCode);
        if (!r || !r.gameState || r.gameState.phase === 'gameOver') return;
        // Has the player reconnected on a new WS in the meantime?
        const reconnectedWs = getWsForPlayer(leavingId);
        if (reconnectedWs && reconnectedWs.readyState === WebSocket.OPEN) return;
        r.gameState = forfeitGame(r.gameState, leavingId);
        r.status = 'finished';
        touchRoom(r);
        await store.set(r);
        clearAfkTimer(loc.roomCode);
        broadcastPlayerViews(r, r.gameState, 'game_update');
        setTimeout(() => { void store.delete(loc.roomCode); }, ROOM_CLEANUP_AFTER_GAME_MS);
      } catch (err) {
        log.error({ err }, 'disconnect-forfeit error');
      }
    }, DISCONNECT_GRACE_MS));
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

async function handleMessage(ws: WebSocket, data: ValidatedClientMessage) {
  const store = getRoomStore();

  switch (data.type) {
    case 'create_room': {
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
      });

      broadcast(room, { type: 'player_joined', players: getPlayerList(room) }, playerId);
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
      const gameState = createGameState(configs);
      room.gameState = gameState;
      room.status = 'playing';
      touchRoom(room);
      await store.set(room);

      broadcastPlayerViews(room, gameState, 'game_start');
      scheduleAfkTimer(room, gameState);
      break;
    }

    case 'reconnect': {
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

      const disconnectTimer = playerDisconnectTimers.get(pid);
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        playerDisconnectTimers.delete(pid);
      }

      attachConnection(ws, pid, room.code);
      touchRoom(room);
      await store.set(room);
      if (room.gameState) {
        const view = createPlayerView(room.gameState, pid);
        sendTo(ws, { type: 'reconnected', gameState: view });
        scheduleAfkTimer(room, room.gameState);
      }
      break;
    }

    case 'leave_game': {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room || !room.gameState || room.gameState.phase === 'gameOver') return;
      const playerId = loc.playerId;
      const dt = playerDisconnectTimers.get(playerId);
      if (dt) { clearTimeout(dt); playerDisconnectTimers.delete(playerId); }
      room.gameState = forfeitGame(room.gameState, playerId);
      room.status = 'finished';
      touchRoom(room);
      await store.set(room);
      clearAfkTimer(loc.roomCode);
      broadcastPlayerViews(room, room.gameState, 'game_update');
      setTimeout(() => { void store.delete(loc.roomCode); }, ROOM_CLEANUP_AFTER_GAME_MS);
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
                setTimeout(() => { void store.delete(loc.roomCode); }, ROOM_CLEANUP_AFTER_GAME_MS);
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
    if (room.isPublic && room.status === 'waiting' && room.players.length < room.maxPlayers) {
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
