import { WebSocket } from 'ws';
import { Room } from './models/room';
import { GameState } from '../shared/lib/types';
import { completeTrick, createGameState, playCard } from '../shared/lib/brisca/engine';
import {
  ClientMessage,
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

const rooms = new Map<string, Room>();
const playerRooms = new Map<WebSocket, string>();
const roomAfkTimers = new Map<string, ReturnType<typeof setTimeout>>();
const roomAfkWarnTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Room expiry cleanup ──────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivityAt > ROOM_EXPIRY_MS) {
      for (const p of room.players) {
        sendTo(p.ws, { type: 'error', message: 'Room expired due to inactivity', code: 'ROOM_NOT_FOUND' });
        playerRooms.delete(p.ws);
      }
      clearAfkTimer(code);
      rooms.delete(code);
    }
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

function broadcast(room: Room, message: ServerMessage, exclude?: WebSocket) {
  const msg = JSON.stringify(message);
  for (const player of room.players) {
    if (player.ws !== exclude && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(msg);
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

function getPlayerId(ws: WebSocket): string {
  const roomCode = playerRooms.get(ws);
  if (!roomCode) return '';
  const room = rooms.get(roomCode);
  if (!room) return '';
  const player = room.players.find(p => p.ws === ws);
  return player?.id || '';
}

function touchRoom(room: Room) {
  room.lastActivityAt = Date.now();
}

function broadcastPlayerViews(room: Room, state: GameState, msgType: 'game_start' | 'game_update') {
  for (const player of room.players) {
    const view = createPlayerView(state, player.id);
    if (msgType === 'game_start') {
      sendTo(player.ws, { type: 'game_start', gameState: view, playerId: player.id });
    } else {
      sendTo(player.ws, { type: 'game_update', gameState: view });
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
  const afkPlayer = next.players.find(p => p.id === afkPlayerId);
  const winningPlayers = next.players.filter(p =>
    afkPlayer?.team !== undefined ? p.team !== afkPlayer.team : p.id !== afkPlayerId
  );
  // Split 120 deck points evenly across winners so team total never exceeds 120
  const winScore = winningPlayers.length > 1 ? Math.floor(120 / winningPlayers.length) : GAME_WIN_SCORE;
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
  const afkWs = room.players.find(p => p.id === afkPlayerId)?.ws;

  roomAfkWarnTimers.set(room.code, setTimeout(() => {
    if (!room.gameState || room.gameState.phase !== 'playing') return;
    const curr = room.gameState.players[room.gameState.currentPlayerIndex];
    if (curr.id !== afkPlayerId) return;
    if (afkWs && afkWs.readyState === WebSocket.OPEN) {
      sendTo(afkWs, { type: 'afk_warning', secondsLeft: AFK_WARNING_MS / 1000 });
    }
  }, AFK_TIMEOUT_MS - AFK_WARNING_MS));

  roomAfkTimers.set(room.code, setTimeout(() => {
    if (!room.gameState || room.gameState.phase !== 'playing') return;
    const curr = room.gameState.players[room.gameState.currentPlayerIndex];
    if (curr.id !== afkPlayerId) return; // turn already moved
    room.gameState = forfeitGame(room.gameState, afkPlayerId);
    room.status = 'finished';
    touchRoom(room);
    broadcastPlayerViews(room, room.gameState, 'game_update');
    clearAfkTimer(room.code);
    setTimeout(() => rooms.delete(room.code), ROOM_CLEANUP_AFTER_GAME_MS);
  }, AFK_TIMEOUT_MS));
}

// ─── WebSocket entry point ────────────────────────────────────────────────────

export function handleWebSocket(ws: WebSocket) {
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString()) as ClientMessage;
      handleMessage(ws, data);
    } catch {
      sendTo(ws, { type: 'error', message: 'Invalid message format', code: 'INVALID_MESSAGE' });
    }
  });

  ws.on('close', () => {
    const roomCode = playerRooms.get(ws);
    if (roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        touchRoom(room);
        // Only evict during lobby. During an active game the closing WS is
        // typically the old lobby connection being replaced by the new game-screen
        // connection (sent via 'reconnect'). Removing the player here would
        // cause card plays to fail because getPlayerId() can no longer find them.
        if (room.status === 'waiting') {
          const leavingPlayer = room.players.find(p => p.ws === ws);
          const leavingId = leavingPlayer?.id || '';
          room.players = room.players.filter(p => p.ws !== ws);
          if (room.players.length === 0) {
            rooms.delete(roomCode);
          } else if (room.hostId === leavingId) {
            broadcast(room, { type: 'error', message: 'The host left the room', code: 'HOST_LEFT' });
            rooms.delete(roomCode);
          } else {
            broadcast(room, { type: 'player_left', players: getPlayerList(room) });
          }
        }
      }
      playerRooms.delete(ws);
    }
  });
}

// ─── Message handler ──────────────────────────────────────────────────────────

function handleMessage(ws: WebSocket, data: ClientMessage) {
  switch (data.type) {
    case 'create_room': {
      let code = generateRoomCode();
      while (rooms.has(code)) code = generateRoomCode();

      const playerId = `p-${Date.now().toString(36)}`;
      const playerName = data.playerName || 'Host';
      const maxPlayers = Math.min(4, Math.max(2, data.maxPlayers || 2));
      const room: Room = {
        code,
        hostId: playerId,
        hostName: playerName,
        maxPlayers,
        players: [{ id: playerId, name: playerName, ws, team: maxPlayers === 4 ? 0 : undefined }],
        gameState: null,
        status: 'waiting',
        isPublic: data.isPublic !== false,
        lastActivityAt: Date.now(),
      };

      rooms.set(code, room);
      playerRooms.set(ws, code);

      sendTo(ws, {
        type: 'room_created',
        roomCode: code,
        playerId,
        players: getPlayerList(room),
        maxPlayers: room.maxPlayers,
      });
      break;
    }

    case 'join_room': {
      const room = rooms.get(data.roomCode?.toUpperCase());
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

      const playerId = `p-${Date.now().toString(36)}`;

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

      room.players.push({ id: playerId, name: data.playerName || 'Player', ws, team });
      playerRooms.set(ws, room.code);
      touchRoom(room);

      sendTo(ws, {
        type: 'room_joined',
        roomCode: room.code,
        playerId,
        players: getPlayerList(room),
        maxPlayers: room.maxPlayers,
      });

      broadcast(room, { type: 'player_joined', players: getPlayerList(room) }, ws);
      break;
    }

    case 'switch_team': {
      const roomCode = playerRooms.get(ws);
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room || room.status !== 'waiting' || room.maxPlayers !== 4) return;
      const player = room.players.find(p => p.ws === ws);
      if (!player) return;
      const targetCount = room.players.filter(p => p.team === data.team).length;
      if (targetCount >= 2) {
        sendTo(ws, { type: 'error', message: 'Team is full', code: 'ROOM_FULL' });
        return;
      }
      player.team = data.team;
      touchRoom(room);
      broadcast(room, { type: 'player_joined', players: getPlayerList(room) });
      break;
    }

    case 'start_game': {
      const roomCode = playerRooms.get(ws);
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      const playerId = getPlayerId(ws);
      if (playerId !== room.hostId) {
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

      broadcastPlayerViews(room, gameState, 'game_start');
      scheduleAfkTimer(room, gameState);
      break;
    }

    case 'reconnect': {
      const pid = data.playerId;
      for (const [code, room] of rooms.entries()) {
        const existing = room.players.find(p => p.id === pid);
        if (existing) {
          existing.ws = ws;
          playerRooms.set(ws, code);
          touchRoom(room);
          if (room.gameState) {
            const view = createPlayerView(room.gameState, pid);
            sendTo(ws, { type: 'reconnected', gameState: view });
            scheduleAfkTimer(room, room.gameState);
          }
          break;
        }
      }
      break;
    }

    case 'play_card': {
      const roomCode = playerRooms.get(ws);
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room || !room.gameState) return;

      const playerId = getPlayerId(ws);
      const currentPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
      if (currentPlayer.id !== playerId) {
        sendTo(ws, { type: 'error', message: 'Not your turn', code: 'NOT_YOUR_TURN' });
        return;
      }

      // Look up card by id from the player's actual hand (prevents spoofing)
      const card = room.gameState.players
        .find(p => p.id === playerId)
        ?.hand.find(c => c.id === data.cardId);
      if (!card) {
        sendTo(ws, { type: 'error', message: 'Invalid card', code: 'INVALID_CARD' });
        return;
      }

      const newState = playCard(room.gameState, playerId, card);
      room.gameState = newState;
      touchRoom(room);

      if (newState.phase === 'trickComplete') {
        clearAfkTimer(roomCode);
        broadcastPlayerViews(room, newState, 'game_update');

        setTimeout(() => {
          if (room.gameState && room.gameState.phase === 'trickComplete') {
            room.gameState = completeTrick(room.gameState);
            touchRoom(room);
            broadcastPlayerViews(room, room.gameState, 'game_update');

            if (room.gameState.phase === 'gameOver') {
              room.status = 'finished';
              setTimeout(() => rooms.delete(roomCode), ROOM_CLEANUP_AFTER_GAME_MS);
            } else {
              scheduleAfkTimer(room, room.gameState);
            }
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

export function getPublicRooms(): PublicRoomInfo[] {
  const result: PublicRoomInfo[] = [];
  for (const room of rooms.values()) {
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
