import { WebSocket } from 'ws';
import { Room } from './models/room';
import { Card, GameState } from '../shared/lib/types';
import { completeTrick, createGameState, playCard } from '../shared/lib/brisca/engine';

const rooms = new Map<string, Room>();
const playerRooms = new Map<WebSocket, string>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function broadcast(room: Room, message: object, exclude?: WebSocket) {
  const msg = JSON.stringify(message);
  for (const player of room.players) {
    if (player.ws !== exclude && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(msg);
    }
  }
}

function sendTo(ws: WebSocket, message: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function getPlayerList(room: Room) {
  return room.players.map(p => ({ id: p.id, name: p.name }));
}

export function handleWebSocket(ws: WebSocket) {
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      handleMessage(ws, data);
    } catch (e) {
      sendTo(ws, { type: 'error', message: 'Invalid message format' });
    }
  });

  ws.on('close', () => {
    const roomCode = playerRooms.get(ws);
    if (roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        const leavingPlayer = room.players.find(p => p.ws === ws);
        const leavingId = leavingPlayer?.id || '';
        room.players = room.players.filter(p => p.ws !== ws);
        if (room.players.length === 0) {
          rooms.delete(roomCode);
        } else {
          if (room.hostId === leavingId) {
            room.hostId = room.players[0].id;
          }
          broadcast(room, {
            type: 'player_left',
            players: getPlayerList(room),
          });
        }
      }
      playerRooms.delete(ws);
    }
  });
}

function getPlayerId(ws: WebSocket): string {
  const roomCode = playerRooms.get(ws);
  if (!roomCode) return '';
  const room = rooms.get(roomCode);
  if (!room) return '';
  const player = room.players.find(p => p.ws === ws);
  return player?.id || '';
}

function handleMessage(ws: WebSocket, data: any) {
  switch (data.type) {
    case 'create_room': {
      let code = generateRoomCode();
      while (rooms.has(code)) code = generateRoomCode();

      const playerId = `p-${Date.now().toString(36)}`;
      const room: Room = {
        code,
        hostId: playerId,
        maxPlayers: Math.min(4, Math.max(2, data.maxPlayers || 2)),
        players: [{ id: playerId, name: data.playerName || 'Host', ws }],
        gameState: null,
        status: 'waiting',
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
        sendTo(ws, { type: 'error', message: 'Room not found' });
        return;
      }
      if (room.status !== 'waiting') {
        sendTo(ws, { type: 'error', message: 'Game already in progress' });
        return;
      }
      if (room.players.length >= room.maxPlayers) {
        sendTo(ws, { type: 'error', message: 'Room is full' });
        return;
      }

      const playerId = `p-${Date.now().toString(36)}`;
      room.players.push({ id: playerId, name: data.playerName || 'Player', ws });
      playerRooms.set(ws, room.code);

      sendTo(ws, {
        type: 'room_joined',
        roomCode: room.code,
        playerId,
        players: getPlayerList(room),
        maxPlayers: room.maxPlayers,
      });

      broadcast(room, {
        type: 'player_joined',
        players: getPlayerList(room),
      }, ws);
      break;
    }

    case 'start_game': {
      const roomCode = playerRooms.get(ws);
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      const playerId = getPlayerId(ws);
      if (playerId !== room.hostId) {
        sendTo(ws, { type: 'error', message: 'Only the host can start the game' });
        return;
      }
      if (room.players.length < 2) {
        sendTo(ws, { type: 'error', message: 'Need at least 2 players' });
        return;
      }

      const configs = room.players.map(p => ({
        id: p.id,
        name: p.name,
        isAI: false,
      }));
      const gameState = createGameState(configs);
      room.gameState = gameState;
      room.status = 'playing';

      for (const player of room.players) {
        const playerView = createPlayerView(gameState, player.id);
        sendTo(player.ws, {
          type: 'game_start',
          gameState: playerView,
          playerId: player.id,
        });
      }
      break;
    }

    case 'reconnect': {
      const pid = data.playerId as string;
      for (const [code, room] of rooms.entries()) {
        const existing = room.players.find(p => p.id === pid);
        if (existing) {
          existing.ws = ws;
          playerRooms.set(ws, code);
          if (room.gameState) {
            const view = createPlayerView(room.gameState, pid);
            sendTo(ws, { type: 'game_update', gameState: view });
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
        sendTo(ws, { type: 'error', message: 'Not your turn' });
        return;
      }

      const card = data.card as Card;
      const newState = playCard(room.gameState, playerId, card);
      room.gameState = newState;

      if (newState.phase === 'trickComplete') {
        for (const player of room.players) {
          const view = createPlayerView(newState, player.id);
          sendTo(player.ws, { type: 'game_update', gameState: view });
        }

        setTimeout(() => {
          if (room.gameState) {
            room.gameState = completeTrick(room.gameState);
            for (const player of room.players) {
              const view = createPlayerView(room.gameState, player.id);
              sendTo(player.ws, { type: 'game_update', gameState: view });
            }
          }
        }, 1500);
      } else {
        for (const player of room.players) {
          const view = createPlayerView(newState, player.id);
          sendTo(player.ws, { type: 'game_update', gameState: view });
        }
      }
      break;
    }
  }
}

function createPlayerView(state: GameState, playerId: string): GameState {
  const view = JSON.parse(JSON.stringify(state)) as GameState;
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
