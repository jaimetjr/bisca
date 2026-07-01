var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

// server/routes.ts
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

// server/game-rooms.ts
import { WebSocket } from "ws";

// shared/lib/types.ts
var RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
var SUITS = ["oros", "copas", "espadas", "bastos"];
var CARD_POINTS = {
  1: 11,
  3: 10,
  12: 4,
  11: 3,
  10: 2,
  2: 0,
  4: 0,
  5: 0,
  6: 0,
  7: 0
};
var CARD_STRENGTH = {
  1: 12,
  3: 11,
  12: 10,
  11: 9,
  10: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  2: 3
};

// shared/lib/brisca/deck.ts
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}` });
    }
  }
  return deck;
}
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
function dealCards(deck, count) {
  const dealt = deck.slice(0, count);
  const remaining = deck.slice(count);
  return { dealt, remaining };
}

// shared/constants/game.ts
var TRICK_DISPLAY_MS = 1500;
var ROOM_EXPIRY_MS = 30 * 60 * 1e3;
var AFK_TIMEOUT_MS = 12e4;
var AFK_WARNING_MS = 3e4;
var ROOM_CLEANUP_AFTER_GAME_MS = 5 * 60 * 1e3;
var ROOM_CODE_LENGTH = 5;
var PLAYER_NAME_MAX_LENGTH = 12;

// shared/lib/brisca/engine.ts
function createGameState(playerConfigs) {
  const deck = shuffleDeck(createDeck());
  const cardsPerPlayer = 3;
  let remaining = deck;
  const players = [];
  for (const config of playerConfigs) {
    const { dealt, remaining: rest } = dealCards(remaining, cardsPerPlayer);
    remaining = rest;
    players.push({
      id: config.id,
      name: config.name,
      hand: dealt,
      capturedCards: [],
      score: 0,
      isAI: config.isAI,
      difficulty: config.difficulty,
      team: config.team
    });
  }
  const trumpCard = remaining[remaining.length - 1];
  const deckWithoutTrump = remaining.slice(0, remaining.length - 1);
  return {
    players,
    deck: deckWithoutTrump,
    trumpCard,
    trumpSuit: trumpCard.suit,
    currentTrick: [],
    currentPlayerIndex: 0,
    leadPlayerIndex: 0,
    phase: "playing",
    trickWinnerId: null,
    lastTrick: null
  };
}
function getCardPoints(card) {
  return CARD_POINTS[card.rank] || 0;
}
function getCardStrength(card) {
  return CARD_STRENGTH[card.rank] || 0;
}
function determineTrickWinner(trick, trumpSuit) {
  if (trick.length === 0) return "";
  const leadSuit = trick[0].card.suit;
  let winnerId = trick[0].playerId;
  let winnerCard = trick[0].card;
  for (let i = 1; i < trick.length; i++) {
    const current = trick[i];
    const currentIsTrump = current.card.suit === trumpSuit;
    const winnerIsTrump = winnerCard.suit === trumpSuit;
    if (currentIsTrump && !winnerIsTrump) {
      winnerId = current.playerId;
      winnerCard = current.card;
    } else if (currentIsTrump && winnerIsTrump) {
      if (getCardStrength(current.card) > getCardStrength(winnerCard)) {
        winnerId = current.playerId;
        winnerCard = current.card;
      }
    } else if (!currentIsTrump && !winnerIsTrump) {
      if (current.card.suit === leadSuit && winnerCard.suit === leadSuit) {
        if (getCardStrength(current.card) > getCardStrength(winnerCard)) {
          winnerId = current.playerId;
          winnerCard = current.card;
        }
      } else if (current.card.suit === leadSuit && winnerCard.suit !== leadSuit) {
        winnerId = current.playerId;
        winnerCard = current.card;
      }
    }
  }
  return winnerId;
}
function legalCards(state, playerId2) {
  const player = state.players.find((p) => p.id === playerId2);
  if (!player) return [];
  if (state.currentTrick.length === 0) return [...player.hand];
  const leadSuit = state.currentTrick[0].card.suit;
  const followCards = player.hand.filter((c) => c.suit === leadSuit);
  return followCards.length > 0 ? followCards : [...player.hand];
}
function isLegalPlay(state, playerId2, card, strictFollowSuit) {
  const player = state.players.find((p) => p.id === playerId2);
  if (!player) return false;
  if (!player.hand.some((c) => c.id === card.id)) return false;
  if (!strictFollowSuit) return true;
  return legalCards(state, playerId2).some((c) => c.id === card.id);
}
function playCard(state, playerId2, card) {
  const newState = JSON.parse(JSON.stringify(state));
  const playerIndex = newState.players.findIndex((p) => p.id === playerId2);
  if (playerIndex === -1) return state;
  const player = newState.players[playerIndex];
  const cardIndex = player.hand.findIndex((c) => c.id === card.id);
  if (cardIndex === -1) return state;
  player.hand.splice(cardIndex, 1);
  newState.currentTrick.push({ playerId: playerId2, card });
  if (newState.currentTrick.length === newState.players.length) {
    newState.phase = "trickComplete";
    const winnerId = determineTrickWinner(newState.currentTrick, newState.trumpSuit);
    newState.trickWinnerId = winnerId;
  } else {
    newState.currentPlayerIndex = (playerIndex + 1) % newState.players.length;
  }
  return newState;
}
function completeTrick(state) {
  const newState = JSON.parse(JSON.stringify(state));
  if (!newState.trickWinnerId) return state;
  const winnerIndex = newState.players.findIndex((p) => p.id === newState.trickWinnerId);
  if (winnerIndex === -1) return state;
  const trickPoints = newState.currentTrick.reduce(
    (sum, tc) => sum + getCardPoints(tc.card),
    0
  );
  const trickCards = newState.currentTrick.map((tc) => tc.card);
  newState.players[winnerIndex].capturedCards.push(...trickCards);
  newState.players[winnerIndex].score += trickPoints;
  newState.lastTrick = [...newState.currentTrick];
  newState.currentTrick = [];
  const hasCards = newState.deck.length > 0 || newState.trumpCard !== null;
  if (hasCards) {
    const drawOrder = [];
    for (let i = 0; i < newState.players.length; i++) {
      drawOrder.push((winnerIndex + i) % newState.players.length);
    }
    for (const idx of drawOrder) {
      if (newState.deck.length > 0) {
        const drawnCard = newState.deck.shift();
        newState.players[idx].hand.push(drawnCard);
      } else if (newState.trumpCard) {
        newState.players[idx].hand.push(newState.trumpCard);
        newState.trumpCard = null;
      }
    }
  }
  const allHandsEmpty = newState.players.every((p) => p.hand.length === 0);
  if (allHandsEmpty) {
    newState.phase = "gameOver";
  } else {
    newState.phase = "playing";
    newState.currentPlayerIndex = winnerIndex;
    newState.leadPlayerIndex = winnerIndex;
  }
  newState.trickWinnerId = null;
  return newState;
}

// shared/lib/validation/client-messages.ts
import { z } from "zod";
var playerName = z.string().trim().min(1).max(PLAYER_NAME_MAX_LENGTH);
var roomCode = z.string().trim().length(ROOM_CODE_LENGTH).regex(/^[A-Z2-9]+$/i);
var playerId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/);
var cardId = z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);
var team = z.union([z.literal(0), z.literal(1)]);
var createRoomSchema = z.object({
  type: z.literal("create_room"),
  playerName,
  maxPlayers: z.number().int().min(2).max(4),
  isPublic: z.boolean().optional(),
  strictFollowSuit: z.boolean().optional()
});
var joinRoomSchema = z.object({
  type: z.literal("join_room"),
  roomCode,
  playerName,
  preferredTeam: team.optional()
});
var switchTeamSchema = z.object({
  type: z.literal("switch_team"),
  team
});
var startGameSchema = z.object({
  type: z.literal("start_game")
});
var playCardSchema = z.object({
  type: z.literal("play_card"),
  cardId
});
var reconnectSchema = z.object({
  type: z.literal("reconnect"),
  playerId,
  reconnectToken: z.string().min(1).max(512).optional()
});
var leaveGameSchema = z.object({
  type: z.literal("leave_game")
});
var clientMessageSchema = z.discriminatedUnion("type", [
  createRoomSchema,
  joinRoomSchema,
  switchTeamSchema,
  startGameSchema,
  playCardSchema,
  reconnectSchema,
  leaveGameSchema
]);

// server/lib/reconnect-token.ts
import { createHmac, timingSafeEqual } from "node:crypto";
var TOKEN_TTL_MS = 60 * 60 * 1e3;
function getSecret() {
  const secret = process.env.RECONNECT_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("RECONNECT_TOKEN_SECRET must be set to a value of at least 16 characters");
  }
  return secret;
}
function sign(payload) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}
function issueReconnectToken(playerId2, roomCode2) {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${playerId2}.${roomCode2}.${expiresAt}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}
function verifyReconnectToken(token) {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [playerId2, roomCode2, expiresAtStr, sig] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;
  const expected = sign(`${playerId2}.${roomCode2}.${expiresAt}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return { playerId: playerId2, roomCode: roomCode2, expiresAt };
}

// server/lib/rate-limit.ts
function tryConsume(bucket, opts, cost) {
  const now = Date.now();
  const elapsed = now - bucket.updatedAt;
  bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsed * opts.refillPerMs);
  bucket.updatedAt = now;
  if (bucket.tokens < cost) return false;
  bucket.tokens -= cost;
  return true;
}
function createKeyedRateLimiter(opts) {
  const buckets = /* @__PURE__ */ new Map();
  return {
    take(key2, cost = 1) {
      let bucket = buckets.get(key2);
      if (!bucket) {
        bucket = { tokens: opts.capacity, updatedAt: Date.now() };
        buckets.set(key2, bucket);
      }
      return tryConsume(bucket, opts, cost);
    },
    drop(key2) {
      buckets.delete(key2);
    }
  };
}
function createObjectRateLimiter(opts) {
  const buckets = /* @__PURE__ */ new WeakMap();
  return {
    take(key2, cost = 1) {
      let bucket = buckets.get(key2);
      if (!bucket) {
        bucket = { tokens: opts.capacity, updatedAt: Date.now() };
        buckets.set(key2, bucket);
      }
      return tryConsume(bucket, opts, cost);
    }
  };
}
function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
var createRoomPerMin = envInt("CREATE_ROOM_LIMIT_PER_MIN", 5);
var createRoomLimiter = createKeyedRateLimiter({
  capacity: createRoomPerMin,
  refillPerMs: createRoomPerMin / 6e4
});
var msgPer10s = envInt("WS_MSG_LIMIT_PER_10S", 30);
var messageLimiter = createObjectRateLimiter({
  capacity: msgPer10s,
  refillPerMs: msgPer10s / 1e4
});

// server/lib/logger.ts
import pino from "pino";
var isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
var level = process.env.LOG_LEVEL ?? (isTest ? "silent" : "info");
var logger = pino({
  level,
  base: { service: "bisca-server" },
  timestamp: pino.stdTimeFunctions.isoTime
});

// server/stores/memory-room-store.ts
var MemoryRoomStore = class {
  rooms = /* @__PURE__ */ new Map();
  async get(code) {
    return this.rooms.get(code);
  }
  async set(room) {
    this.rooms.set(room.code, room);
  }
  async setIfAbsent(room) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, room);
    return true;
  }
  async delete(code) {
    this.rooms.delete(code);
  }
  async list() {
    return [...this.rooms.values()];
  }
};

// server/stores/redis-room-store.ts
var KEY_PREFIX = "bisca:room:";
var INDEX_KEY = "bisca:rooms:index";
var TTL_SECONDS = Math.ceil(ROOM_EXPIRY_MS / 1e3) + 60;
function key(code) {
  return `${KEY_PREFIX}${code}`;
}
var RedisRoomStore = class {
  constructor(redis) {
    this.redis = redis;
  }
  async get(code) {
    const raw = await this.redis.get(key(code));
    if (!raw) return void 0;
    try {
      return JSON.parse(raw);
    } catch {
      return void 0;
    }
  }
  async set(room) {
    const payload = JSON.stringify(room);
    await this.redis.multi().set(key(room.code), payload, "EX", TTL_SECONDS).sadd(INDEX_KEY, room.code).exec();
  }
  async setIfAbsent(room) {
    const payload = JSON.stringify(room);
    const result = await this.redis.set(key(room.code), payload, "EX", TTL_SECONDS, "NX");
    if (result !== "OK") return false;
    await this.redis.sadd(INDEX_KEY, room.code);
    return true;
  }
  async delete(code) {
    await this.redis.multi().del(key(code)).srem(INDEX_KEY, code).exec();
  }
  async list() {
    const codes = await this.redis.smembers(INDEX_KEY);
    if (codes.length === 0) return [];
    const keys = codes.map(key);
    const values = await this.redis.mget(...keys);
    const rooms = [];
    const stale = [];
    for (let i = 0; i < codes.length; i++) {
      const raw = values[i];
      if (!raw) {
        stale.push(codes[i]);
        continue;
      }
      try {
        rooms.push(JSON.parse(raw));
      } catch {
        stale.push(codes[i]);
      }
    }
    if (stale.length > 0) {
      await this.redis.srem(INDEX_KEY, ...stale);
    }
    return rooms;
  }
};

// server/lib/redis.ts
import IORedis from "ioredis";
var log = logger.child({ module: "redis" });
var client;
function getRedis() {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL must be set when ROOM_STORE=redis");
  }
  client = new IORedis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true
  });
  client.on("error", (err) => {
    log.error({ err: err.message }, "redis client error");
  });
  return client;
}

// server/stores/index.ts
var log2 = logger.child({ module: "room-store" });
var instance;
function getRoomStore() {
  if (instance) return instance;
  const kind = (process.env.ROOM_STORE ?? "memory").toLowerCase();
  if (kind === "redis") {
    instance = new RedisRoomStore(getRedis());
    log2.info("using Redis backend");
  } else {
    instance = new MemoryRoomStore();
    log2.info("using in-memory backend");
  }
  return instance;
}

// server/connections/registry.ts
var wsToPlayer = /* @__PURE__ */ new Map();
var playerToWs = /* @__PURE__ */ new Map();
function attachConnection(ws, playerId2, roomCode2) {
  const previous = playerToWs.get(playerId2);
  if (previous && previous !== ws) {
    wsToPlayer.delete(previous);
  }
  wsToPlayer.set(ws, { playerId: playerId2, roomCode: roomCode2 });
  playerToWs.set(playerId2, ws);
}
function detachByWs(ws) {
  const loc = wsToPlayer.get(ws);
  if (!loc) return void 0;
  wsToPlayer.delete(ws);
  if (playerToWs.get(loc.playerId) === ws) {
    playerToWs.delete(loc.playerId);
  }
  return loc;
}
function getLocation(ws) {
  return wsToPlayer.get(ws);
}
function getWsForPlayer(playerId2) {
  return playerToWs.get(playerId2);
}

// server/game-rooms.ts
var log3 = logger.child({ module: "game-rooms" });
var roomAfkTimers = /* @__PURE__ */ new Map();
var roomAfkWarnTimers = /* @__PURE__ */ new Map();
var playerDisconnectTimers = /* @__PURE__ */ new Map();
var wsClientIp = /* @__PURE__ */ new WeakMap();
var DISCONNECT_GRACE_MS = 1e4;
function clientIpFor(ws) {
  return wsClientIp.get(ws) ?? "unknown";
}
function clientIpFromRequest(request) {
  const fwd = request.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return request.socket.remoteAddress ?? "unknown";
}
setInterval(async () => {
  try {
    const store = getRoomStore();
    const all = await store.list();
    const now = Date.now();
    for (const room of all) {
      if (now - room.lastActivityAt > ROOM_EXPIRY_MS) {
        for (const p of room.players) {
          const ws = getWsForPlayer(p.id);
          if (ws) sendTo(ws, { type: "error", message: "Room expired due to inactivity", code: "ROOM_NOT_FOUND" });
        }
        clearAfkTimer(room.code);
        await store.delete(room.code);
      }
    }
  } catch (err) {
    log3.error({ err }, "room-cleanup error");
  }
}, 6e4);
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
function broadcast(room, message, excludePlayerId) {
  const msg = JSON.stringify(message);
  for (const player of room.players) {
    if (excludePlayerId && player.id === excludePlayerId) continue;
    const ws = getWsForPlayer(player.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}
function sendTo(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
function getPlayerList(room) {
  return room.players.map((p) => ({ id: p.id, name: p.name, team: p.team }));
}
function touchRoom(room) {
  room.lastActivityAt = Date.now();
}
function broadcastPlayerViews(room, state, msgType) {
  for (const player of room.players) {
    const ws = getWsForPlayer(player.id);
    if (!ws) continue;
    const view = createPlayerView(state, player.id);
    if (msgType === "game_start") {
      sendTo(ws, { type: "game_start", gameState: view, playerId: player.id });
    } else {
      sendTo(ws, { type: "game_update", gameState: view });
    }
  }
}
function clearAfkTimer(roomCode2) {
  const t = roomAfkTimers.get(roomCode2);
  if (t) {
    clearTimeout(t);
    roomAfkTimers.delete(roomCode2);
  }
  const w = roomAfkWarnTimers.get(roomCode2);
  if (w) {
    clearTimeout(w);
    roomAfkWarnTimers.delete(roomCode2);
  }
}
function forfeitGame(state, afkPlayerId) {
  const next = structuredClone(state);
  next.phase = "gameOver";
  next.endReason = "forfeit";
  const afkPlayer = next.players.find((p) => p.id === afkPlayerId);
  next.forfeitedBy = afkPlayer?.name;
  const winningPlayers = next.players.filter(
    (p) => afkPlayer?.team !== void 0 ? p.team !== afkPlayer.team : p.id !== afkPlayerId
  );
  const winScore = Math.floor(120 / winningPlayers.length);
  next.players.forEach((p) => {
    const loses = afkPlayer?.team !== void 0 ? p.team === afkPlayer.team : p.id === afkPlayerId;
    p.score = loses ? 0 : winScore;
  });
  return next;
}
function scheduleAfkTimer(room, state) {
  if (state.phase !== "playing") return;
  clearAfkTimer(room.code);
  const afkPlayerId = state.players[state.currentPlayerIndex].id;
  const roomCode2 = room.code;
  roomAfkWarnTimers.set(roomCode2, setTimeout(async () => {
    try {
      const store = getRoomStore();
      const fresh = await store.get(roomCode2);
      if (!fresh?.gameState || fresh.gameState.phase !== "playing") return;
      const curr = fresh.gameState.players[fresh.gameState.currentPlayerIndex];
      if (curr.id !== afkPlayerId) return;
      const ws = getWsForPlayer(afkPlayerId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendTo(ws, { type: "afk_warning", secondsLeft: AFK_WARNING_MS / 1e3 });
      }
    } catch (err) {
      log3.error({ err }, "afk-warn error");
    }
  }, AFK_TIMEOUT_MS - AFK_WARNING_MS));
  roomAfkTimers.set(roomCode2, setTimeout(async () => {
    try {
      const store = getRoomStore();
      const fresh = await store.get(roomCode2);
      if (!fresh?.gameState || fresh.gameState.phase !== "playing") return;
      const curr = fresh.gameState.players[fresh.gameState.currentPlayerIndex];
      if (curr.id !== afkPlayerId) return;
      fresh.gameState = forfeitGame(fresh.gameState, afkPlayerId);
      fresh.status = "finished";
      touchRoom(fresh);
      await store.set(fresh);
      broadcastPlayerViews(fresh, fresh.gameState, "game_update");
      clearAfkTimer(roomCode2);
      setTimeout(() => {
        void store.delete(roomCode2);
      }, ROOM_CLEANUP_AFTER_GAME_MS);
    } catch (err) {
      log3.error({ err }, "afk-forfeit error");
    }
  }, AFK_TIMEOUT_MS));
}
function handleWebSocket(ws, request) {
  if (request) {
    wsClientIp.set(ws, clientIpFromRequest(request));
  }
  ws.on("message", (raw) => {
    if (!messageLimiter.take(ws)) {
      sendTo(ws, { type: "error", message: "Rate limit exceeded", code: "RATE_LIMITED" });
      try {
        ws.close(1008, "rate limited");
      } catch {
      }
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      sendTo(ws, { type: "error", message: "Invalid message format", code: "INVALID_MESSAGE" });
      return;
    }
    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      sendTo(ws, { type: "error", message: "Invalid message payload", code: "INVALID_MESSAGE" });
      return;
    }
    void handleMessage(ws, result.data).catch((err) => {
      log3.error({ err }, "ws-handler error");
      sendTo(ws, { type: "error", message: "Internal error", code: "INVALID_MESSAGE" });
    });
  });
  ws.on("close", () => {
    void handleClose(ws).catch((err) => log3.error({ err }, "ws-close error"));
  });
}
async function handleClose(ws) {
  const loc = detachByWs(ws);
  if (!loc) return;
  const store = getRoomStore();
  const room = await store.get(loc.roomCode);
  if (!room) return;
  touchRoom(room);
  const leavingId = loc.playerId;
  if (room.status === "waiting") {
    room.players = room.players.filter((p) => p.id !== leavingId);
    if (room.players.length === 0) {
      await store.delete(room.code);
      return;
    }
    if (room.hostId === leavingId) {
      broadcast(room, { type: "error", message: "The host left the room", code: "HOST_LEFT" });
      await store.delete(room.code);
      return;
    }
    await store.set(room);
    broadcast(room, { type: "player_left", players: getPlayerList(room) });
    return;
  }
  if (room.status === "playing") {
    await store.set(room);
    playerDisconnectTimers.set(leavingId, setTimeout(async () => {
      playerDisconnectTimers.delete(leavingId);
      try {
        const r = await store.get(loc.roomCode);
        if (!r || !r.gameState || r.gameState.phase === "gameOver") return;
        const reconnectedWs = getWsForPlayer(leavingId);
        if (reconnectedWs && reconnectedWs.readyState === WebSocket.OPEN) return;
        r.gameState = forfeitGame(r.gameState, leavingId);
        r.status = "finished";
        touchRoom(r);
        await store.set(r);
        clearAfkTimer(loc.roomCode);
        broadcastPlayerViews(r, r.gameState, "game_update");
        setTimeout(() => {
          void store.delete(loc.roomCode);
        }, ROOM_CLEANUP_AFTER_GAME_MS);
      } catch (err) {
        log3.error({ err }, "disconnect-forfeit error");
      }
    }, DISCONNECT_GRACE_MS));
  }
}
async function handleMessage(ws, data) {
  const store = getRoomStore();
  switch (data.type) {
    case "create_room": {
      if (!createRoomLimiter.take(clientIpFor(ws))) {
        sendTo(ws, { type: "error", message: "Too many rooms created \u2014 try again shortly", code: "RATE_LIMITED" });
        return;
      }
      let code = generateRoomCode();
      const playerId2 = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const playerName2 = data.playerName || "Host";
      const maxPlayers = Math.min(4, Math.max(2, data.maxPlayers || 2));
      let stored = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = {
          code,
          hostId: playerId2,
          hostName: playerName2,
          maxPlayers,
          players: [{ id: playerId2, name: playerName2, team: maxPlayers === 4 ? 0 : void 0 }],
          gameState: null,
          status: "waiting",
          isPublic: data.isPublic !== false,
          lastActivityAt: Date.now(),
          strictFollowSuit: data.strictFollowSuit === true
        };
        if (await store.setIfAbsent(candidate)) {
          stored = true;
          attachConnection(ws, playerId2, code);
          sendTo(ws, {
            type: "room_created",
            roomCode: code,
            playerId: playerId2,
            reconnectToken: issueReconnectToken(playerId2, code),
            players: getPlayerList(candidate),
            maxPlayers: candidate.maxPlayers
          });
          break;
        }
        code = generateRoomCode();
      }
      if (!stored) {
        sendTo(ws, { type: "error", message: "Failed to allocate room", code: "INVALID_MESSAGE" });
      }
      break;
    }
    case "join_room": {
      const room = await store.get(data.roomCode?.toUpperCase());
      if (!room) {
        sendTo(ws, { type: "error", message: "Room not found", code: "ROOM_NOT_FOUND" });
        return;
      }
      if (room.status !== "waiting") {
        sendTo(ws, { type: "error", message: "Game already in progress", code: "GAME_ALREADY_STARTED" });
        return;
      }
      if (room.players.length >= room.maxPlayers) {
        sendTo(ws, { type: "error", message: "Room is full", code: "ROOM_FULL" });
        return;
      }
      const playerId2 = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      let team2;
      if (room.maxPlayers === 4) {
        const t0Count = room.players.filter((p) => p.team === 0).length;
        const t1Count = room.players.filter((p) => p.team === 1).length;
        if (data.preferredTeam !== void 0 && (data.preferredTeam === 0 ? t0Count : t1Count) < 2) {
          team2 = data.preferredTeam;
        } else {
          team2 = t0Count <= t1Count ? 0 : 1;
        }
      }
      room.players.push({ id: playerId2, name: data.playerName || "Player", team: team2 });
      touchRoom(room);
      await store.set(room);
      attachConnection(ws, playerId2, room.code);
      sendTo(ws, {
        type: "room_joined",
        roomCode: room.code,
        playerId: playerId2,
        reconnectToken: issueReconnectToken(playerId2, room.code),
        players: getPlayerList(room),
        maxPlayers: room.maxPlayers
      });
      broadcast(room, { type: "player_joined", players: getPlayerList(room) }, playerId2);
      break;
    }
    case "switch_team": {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room || room.status !== "waiting" || room.maxPlayers !== 4) return;
      const player = room.players.find((p) => p.id === loc.playerId);
      if (!player) return;
      const targetCount = room.players.filter((p) => p.team === data.team).length;
      if (targetCount >= 2) {
        sendTo(ws, { type: "error", message: "Team is full", code: "ROOM_FULL" });
        return;
      }
      player.team = data.team;
      touchRoom(room);
      await store.set(room);
      broadcast(room, { type: "player_joined", players: getPlayerList(room) });
      break;
    }
    case "start_game": {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room) return;
      if (loc.playerId !== room.hostId) {
        sendTo(ws, { type: "error", message: "Only the host can start the game", code: "NOT_HOST" });
        return;
      }
      if (room.players.length < 2) {
        sendTo(ws, { type: "error", message: "Need at least 2 players", code: "NEED_MORE_PLAYERS" });
        return;
      }
      const configs = room.players.map((p) => ({ id: p.id, name: p.name, isAI: false, team: p.team }));
      const gameState = createGameState(configs);
      room.gameState = gameState;
      room.status = "playing";
      touchRoom(room);
      await store.set(room);
      broadcastPlayerViews(room, gameState, "game_start");
      scheduleAfkTimer(room, gameState);
      break;
    }
    case "reconnect": {
      if (!data.reconnectToken) {
        sendTo(ws, { type: "error", message: "Reconnect token required", code: "INVALID_TOKEN" });
        return;
      }
      const claims = verifyReconnectToken(data.reconnectToken);
      if (!claims || claims.playerId !== data.playerId) {
        sendTo(ws, { type: "error", message: "Invalid or expired reconnect token", code: "INVALID_TOKEN" });
        return;
      }
      const pid = claims.playerId;
      const room = await store.get(claims.roomCode);
      if (!room) {
        sendTo(ws, { type: "error", message: "Room no longer exists", code: "ROOM_NOT_FOUND" });
        return;
      }
      const existing = room.players.find((p) => p.id === pid);
      if (!existing) {
        sendTo(ws, { type: "error", message: "Player not found in room", code: "INVALID_TOKEN" });
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
        sendTo(ws, { type: "reconnected", gameState: view });
        scheduleAfkTimer(room, room.gameState);
      }
      break;
    }
    case "leave_game": {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room || !room.gameState || room.gameState.phase === "gameOver") return;
      const playerId2 = loc.playerId;
      const dt = playerDisconnectTimers.get(playerId2);
      if (dt) {
        clearTimeout(dt);
        playerDisconnectTimers.delete(playerId2);
      }
      room.gameState = forfeitGame(room.gameState, playerId2);
      room.status = "finished";
      touchRoom(room);
      await store.set(room);
      clearAfkTimer(loc.roomCode);
      broadcastPlayerViews(room, room.gameState, "game_update");
      setTimeout(() => {
        void store.delete(loc.roomCode);
      }, ROOM_CLEANUP_AFTER_GAME_MS);
      break;
    }
    case "play_card": {
      const loc = getLocation(ws);
      if (!loc) return;
      const room = await store.get(loc.roomCode);
      if (!room || !room.gameState) return;
      const playerId2 = loc.playerId;
      const currentPlayer = room.gameState.players[room.gameState.currentPlayerIndex];
      if (currentPlayer.id !== playerId2) {
        sendTo(ws, { type: "error", message: "Not your turn", code: "NOT_YOUR_TURN" });
        return;
      }
      const card = room.gameState.players.find((p) => p.id === playerId2)?.hand.find((c) => c.id === data.cardId);
      if (!card) {
        sendTo(ws, { type: "error", message: "Invalid card", code: "INVALID_CARD" });
        return;
      }
      if (!isLegalPlay(room.gameState, playerId2, card, room.strictFollowSuit === true)) {
        sendTo(ws, { type: "error", message: "You must follow suit", code: "INVALID_CARD" });
        return;
      }
      const newState = playCard(room.gameState, playerId2, card);
      room.gameState = newState;
      touchRoom(room);
      await store.set(room);
      if (newState.phase === "trickComplete") {
        clearAfkTimer(loc.roomCode);
        broadcastPlayerViews(room, newState, "game_update");
        setTimeout(async () => {
          try {
            const r = await store.get(loc.roomCode);
            if (r?.gameState && r.gameState.phase === "trickComplete") {
              r.gameState = completeTrick(r.gameState);
              touchRoom(r);
              await store.set(r);
              broadcastPlayerViews(r, r.gameState, "game_update");
              if (r.gameState.phase === "gameOver") {
                r.status = "finished";
                await store.set(r);
                setTimeout(() => {
                  void store.delete(loc.roomCode);
                }, ROOM_CLEANUP_AFTER_GAME_MS);
              } else {
                scheduleAfkTimer(r, r.gameState);
              }
            }
          } catch (err) {
            log3.error({ err }, "trick-advance error");
          }
        }, TRICK_DISPLAY_MS);
      } else {
        broadcastPlayerViews(room, newState, "game_update");
        scheduleAfkTimer(room, newState);
      }
      break;
    }
  }
}
function createPlayerView(state, playerId2) {
  const view = structuredClone(state);
  for (const player of view.players) {
    if (player.id !== playerId2) {
      player.hand = player.hand.map(() => ({
        suit: "bastos",
        rank: 1,
        id: "hidden"
      }));
    }
  }
  return view;
}
async function getPublicRooms() {
  const store = getRoomStore();
  const all = await store.list();
  const result = [];
  for (const room of all) {
    if (room.isPublic && room.status === "waiting" && room.players.length < room.maxPlayers) {
      result.push({
        code: room.code,
        hostName: room.hostName,
        maxPlayers: room.maxPlayers,
        currentPlayers: room.players.length,
        mode: room.maxPlayers === 4 ? "2v2" : "1v1"
      });
    }
  }
  return result;
}

// server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// shared/lib/schema.ts
var schema_exports = {};
__export(schema_exports, {
  authCodes: () => authCodes,
  gameHistory: () => gameHistory,
  insertGameHistorySchema: () => insertGameHistorySchema,
  insertUserSchema: () => insertUserSchema,
  userAchievements: () => userAchievements,
  userQuestProgress: () => userQuestProgress,
  users: () => users
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, serial, date, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var authCodes = pgTable(
  "auth_codes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(),
    purpose: text("purpose").notNull(),
    // 'email_verify' | 'password_reset'
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow()
  },
  (t) => ({
    userPurposeIdx: index("auth_codes_user_purpose_idx").on(t.userId, t.purpose)
  })
);
var insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var gameHistory = pgTable("game_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  result: text("result").notNull(),
  // 'win' | 'loss' | 'draw'
  score: integer("score").notNull(),
  opponentScore: integer("opponent_score").notNull(),
  mode: text("mode").notNull(),
  // 'ai' | 'online'
  aiDifficulty: text("ai_difficulty"),
  // only for ai mode
  playedAt: timestamp("played_at").defaultNow()
});
var insertGameHistorySchema = createInsertSchema(gameHistory).omit({ id: true, playedAt: true });
var userAchievements = pgTable(
  "user_achievements",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    achievementId: text("achievement_id").notNull(),
    unlockedAt: timestamp("unlocked_at").defaultNow()
  },
  (t) => ({
    userIdx: index("user_achievements_user_idx").on(t.userId),
    uniq: uniqueIndex("user_achievements_unique").on(t.userId, t.achievementId)
  })
);
var userQuestProgress = pgTable(
  "user_quest_progress",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    questId: text("quest_id").notNull(),
    questDate: date("quest_date").notNull(),
    // 'YYYY-MM-DD' UTC
    progress: integer("progress").notNull().default(0),
    target: integer("target").notNull(),
    claimed: boolean("claimed").notNull().default(false),
    claimedAt: timestamp("claimed_at")
  },
  (t) => ({
    userDateIdx: index("user_quest_progress_user_date_idx").on(t.userId, t.questDate),
    uniq: uniqueIndex("user_quest_progress_unique").on(t.userId, t.questDate, t.questId)
  })
);

// server/db.ts
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle(pool, { schema: schema_exports });

// server/routes.ts
import { eq as eq4, desc as desc3, sql as sql4 } from "drizzle-orm";

// server/lib/auth.ts
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
var BCRYPT_ROUNDS = 10;
var TOKEN_TTL = "30d";
var cachedSecret = null;
function getSecret2() {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET must be set to a random string of at least 16 characters");
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}
function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
function signAuthToken(userId, emailVerified) {
  return new SignJWT({ ev: emailVerified }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(TOKEN_TTL).sign(getSecret2());
}
async function verifyAuthToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret2());
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub, emailVerified: payload.ev === true };
  } catch {
    return null;
  }
}

// server/lib/auth-codes.ts
import { randomInt } from "node:crypto";
import { and, eq, desc, sql as sql2, isNull } from "drizzle-orm";
var CODE_TTL_MS = 15 * 60 * 1e3;
var MAX_ATTEMPTS = 5;
function generateCode() {
  return String(randomInt(0, 1e6)).padStart(6, "0");
}
async function issueCode(userId, purpose) {
  await db.delete(authCodes).where(
    and(eq(authCodes.userId, userId), eq(authCodes.purpose, purpose))
  );
  const code = generateCode();
  const codeHash = await hashPassword(code);
  await db.insert(authCodes).values({
    userId,
    purpose,
    codeHash,
    expiresAt: new Date(Date.now() + CODE_TTL_MS)
  });
  return code;
}
async function verifyCode(userId, purpose, code) {
  const [row] = await db.select().from(authCodes).where(
    and(
      eq(authCodes.userId, userId),
      eq(authCodes.purpose, purpose),
      isNull(authCodes.consumedAt)
    )
  ).orderBy(desc(authCodes.createdAt)).limit(1);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
  const match = await verifyPassword(code, row.codeHash);
  if (!match) {
    await db.update(authCodes).set({ attempts: row.attempts + 1 }).where(eq(authCodes.id, row.id));
    return { ok: false, reason: "invalid" };
  }
  await db.update(authCodes).set({ consumedAt: sql2`now()` }).where(eq(authCodes.id, row.id));
  return { ok: true };
}

// server/lib/email.ts
var log4 = logger.child({ module: "email" });
var RESEND_ENDPOINT = "https://api.resend.com/emails";
var FROM = process.env.EMAIL_FROM ?? "Bisca <onboarding@resend.dev>";
var APP_NAME = "Bisca";
async function sendEmail(to, subject, html, devCode) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log4.warn({ to, subject, code: devCode }, "RESEND_API_KEY not set \u2014 logging code instead of sending");
    return;
  }
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: FROM, to, subject, html })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log4.error({ status: res.status, body }, "Resend send failed");
    throw new Error("Failed to send email");
  }
}
function codeEmailHtml(intro, code) {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a472a; margin-bottom: 8px;">${APP_NAME}</h2>
      <p style="color: #333; font-size: 15px;">${intro}</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1a472a; text-align: center; margin: 24px 0;">${code}</p>
      <p style="color: #888; font-size: 13px;">This code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>
    </div>`;
}
async function sendVerificationCode(to, code) {
  await sendEmail(
    to,
    `${APP_NAME} \u2014 verify your email`,
    codeEmailHtml("Enter this code in the app to verify your email address:", code),
    code
  );
}
async function sendPasswordResetCode(to, code) {
  await sendEmail(
    to,
    `${APP_NAME} \u2014 reset your password`,
    codeEmailHtml("Enter this code in the app to reset your password:", code),
    code
  );
}

// server/lib/achievement-service.ts
import { eq as eq2, desc as desc2 } from "drizzle-orm";

// shared/lib/achievements/evaluator.ts
function evaluateAchievements(ctx) {
  const { thisGame, previousGames, alreadyUnlocked } = ctx;
  const newlyUnlocked = [];
  const isWin = thisGame.result === "win";
  if (isWin && !alreadyUnlocked.has("first_win")) {
    newlyUnlocked.push("first_win");
  }
  if (isWin && thisGame.mode === "online" && !alreadyUnlocked.has("first_online_win")) {
    newlyUnlocked.push("first_online_win");
  }
  if (isWin && thisGame.score >= 100 && !alreadyUnlocked.has("centurion")) {
    newlyUnlocked.push("centurion");
  }
  if (isWin && thisGame.score - thisGame.opponentScore >= 60 && !alreadyUnlocked.has("landslide")) {
    newlyUnlocked.push("landslide");
  }
  if (isWin && !alreadyUnlocked.has("hat_trick")) {
    const lastTwo = previousGames.slice(0, 2);
    if (lastTwo.length === 2 && lastTwo.every((g) => g.result === "win")) {
      newlyUnlocked.push("hat_trick");
    }
  }
  return newlyUnlocked;
}

// server/lib/achievement-service.ts
async function recordGameAndEvaluate(input) {
  const { userId, result, score, opponentScore, mode } = input;
  const previous = await db.select({ result: gameHistory.result, mode: gameHistory.mode }).from(gameHistory).where(eq2(gameHistory.userId, userId)).orderBy(desc2(gameHistory.playedAt)).limit(4);
  const alreadyUnlocked = await db.select({ achievementId: userAchievements.achievementId }).from(userAchievements).where(eq2(userAchievements.userId, userId));
  await db.insert(gameHistory).values({
    userId,
    result,
    score,
    opponentScore,
    mode
  });
  const newlyUnlocked = evaluateAchievements({
    thisGame: { result, score, opponentScore, mode },
    previousGames: previous.map((g) => ({
      result: g.result,
      mode: g.mode
    })),
    alreadyUnlocked: new Set(alreadyUnlocked.map((a) => a.achievementId))
  });
  if (newlyUnlocked.length > 0) {
    await db.insert(userAchievements).values(
      newlyUnlocked.map((id) => ({ userId, achievementId: id }))
    ).onConflictDoNothing();
  }
  return newlyUnlocked;
}
async function listUnlockedAchievementIds(userId) {
  const rows = await db.select({ achievementId: userAchievements.achievementId }).from(userAchievements).where(eq2(userAchievements.userId, userId));
  return rows.map((r) => r.achievementId);
}

// shared/lib/achievements/definitions.ts
var ACHIEVEMENTS = [
  {
    id: "first_win",
    title: "First Win",
    description: "Win your first game.",
    icon: "trophy-outline",
    xp: 10
  },
  {
    id: "first_online_win",
    title: "Online Debut",
    description: "Win your first online game.",
    icon: "earth",
    xp: 15
  },
  {
    id: "centurion",
    title: "Centurion",
    description: "Win a game scoring 100 or more points.",
    icon: "medal-outline",
    xp: 25
  },
  {
    id: "landslide",
    title: "Landslide",
    description: "Win a game by 60 or more points.",
    icon: "chart-line",
    xp: 25
  },
  {
    id: "hat_trick",
    title: "Hat Trick",
    description: "Win three games in a row.",
    icon: "fire",
    xp: 30
  }
];
var ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
function getAchievementXp(ids) {
  let total = 0;
  for (const id of ids) {
    const def = ACHIEVEMENT_BY_ID.get(id);
    if (def) total += def.xp;
  }
  return total;
}

// server/lib/quest-service.ts
import { and as and2, eq as eq3, sql as sql3 } from "drizzle-orm";

// shared/lib/quests/types.ts
var QUESTS_PER_DAY = 3;

// shared/lib/quests/definitions.ts
var QUESTS = [
  {
    id: "play_3",
    title: "Warm-up",
    description: "Play 3 games today.",
    icon: "play-circle-outline",
    target: 3,
    xp: 10,
    evalDelta: () => 1
  },
  {
    id: "win_2",
    title: "Daily Double",
    description: "Win 2 games today.",
    icon: "trophy-variant-outline",
    target: 2,
    xp: 15,
    evalDelta: (g) => g.result === "win" ? 1 : 0
  },
  {
    id: "score_80",
    title: "Strong Hand",
    description: "Score 80 or more in a single game today.",
    icon: "cards",
    target: 1,
    xp: 15,
    evalDelta: (g) => g.score >= 80 ? 1 : 0
  },
  {
    id: "online_1",
    title: "Online Outing",
    description: "Play 1 online game today.",
    icon: "earth",
    target: 1,
    xp: 10,
    evalDelta: (g) => g.mode === "online" ? 1 : 0
  },
  {
    id: "centurion_today",
    title: "Hundred Club",
    description: "Score 100 or more in a single game today.",
    icon: "medal-outline",
    target: 1,
    xp: 25,
    evalDelta: (g) => g.score >= 100 ? 1 : 0
  }
];
var QUEST_BY_ID = new Map(QUESTS.map((q) => [q.id, q]));

// shared/lib/quests/evaluator.ts
function utcDateString(now = /* @__PURE__ */ new Date()) {
  return now.toISOString().slice(0, 10);
}
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pickTodaysQuests(date2, n = QUESTS_PER_DAY, catalog = QUESTS) {
  const scored = catalog.map((q) => ({ q, score: hash32(`${date2}|${q.id}`) }));
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, Math.min(n, scored.length)).map((s) => s.q);
}
function deltaForQuest(quest, game) {
  const d = quest.evalDelta(game);
  return d > 0 ? d : 0;
}

// server/lib/quest-service.ts
async function getTodaysQuests(userId) {
  const date2 = utcDateString();
  const todaysDefs = pickTodaysQuests(date2);
  const existing = await db.select().from(userQuestProgress).where(
    and2(
      eq3(userQuestProgress.userId, userId),
      eq3(userQuestProgress.questDate, date2)
    )
  );
  const existingById = new Map(existing.map((r) => [r.questId, r]));
  const quests = todaysDefs.map((def) => {
    const row = existingById.get(def.id);
    return {
      def,
      progress: {
        questId: def.id,
        questDate: date2,
        progress: row?.progress ?? 0,
        target: def.target,
        claimed: row?.claimed ?? false
      }
    };
  });
  return { date: date2, quests };
}
async function applyGameToTodaysQuests(userId, game) {
  const date2 = utcDateString();
  const todaysDefs = pickTodaysQuests(date2);
  for (const def of todaysDefs) {
    const delta = deltaForQuest(def, game);
    if (delta <= 0) continue;
    await db.insert(userQuestProgress).values({
      userId,
      questId: def.id,
      questDate: date2,
      progress: Math.min(delta, def.target),
      target: def.target,
      claimed: false
    }).onConflictDoUpdate({
      target: [
        userQuestProgress.userId,
        userQuestProgress.questDate,
        userQuestProgress.questId
      ],
      set: {
        progress: sql3`LEAST(${userQuestProgress.target}, ${userQuestProgress.progress} + ${delta})`
      }
    });
  }
}
async function claimQuest(userId, questId) {
  const def = QUEST_BY_ID.get(questId);
  if (!def) return { ok: false, reason: "unknown_quest" };
  const date2 = utcDateString();
  const todaysIds = new Set(pickTodaysQuests(date2).map((q) => q.id));
  if (!todaysIds.has(questId)) return { ok: false, reason: "not_today" };
  const [row] = await db.select().from(userQuestProgress).where(
    and2(
      eq3(userQuestProgress.userId, userId),
      eq3(userQuestProgress.questDate, date2),
      eq3(userQuestProgress.questId, questId)
    )
  ).limit(1);
  if (!row || row.progress < row.target) return { ok: false, reason: "incomplete" };
  if (row.claimed) return { ok: false, reason: "already_claimed" };
  await db.update(userQuestProgress).set({ claimed: true, claimedAt: sql3`now()` }).where(
    and2(
      eq3(userQuestProgress.userId, userId),
      eq3(userQuestProgress.questDate, date2),
      eq3(userQuestProgress.questId, questId)
    )
  );
  return { ok: true, xp: def.xp };
}

// server/routes.ts
var log5 = logger.child({ module: "routes" });
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var MIN_PASSWORD_LENGTH = 8;
var codeRequestLimiter = createKeyedRateLimiter({ capacity: 5, refillPerMs: 5 / (15 * 6e4) });
var loginIpLimiter = createKeyedRateLimiter({ capacity: 20, refillPerMs: 20 / (15 * 6e4) });
var loginEmailLimiter = createKeyedRateLimiter({ capacity: 8, refillPerMs: 8 / (15 * 6e4) });
var registerIpLimiter = createKeyedRateLimiter({ capacity: 10, refillPerMs: 10 / (15 * 6e4) });
var TOO_MANY = { error: "Too many attempts \u2014 please try again later" };
function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}
function isAtLeast18ISO(iso) {
  if (!ISO_DATE_RE.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dob = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dob.getTime()) || dob.getUTCDate() !== d || dob.getUTCMonth() !== m - 1) return false;
  const now = /* @__PURE__ */ new Date();
  let age = now.getUTCFullYear() - y;
  const mDiff = now.getUTCMonth() - (m - 1);
  if (mDiff < 0 || mDiff === 0 && now.getUTCDate() < d) age--;
  return age >= 18;
}
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const claims = await verifyAuthToken(authHeader.slice(7));
  if (!claims) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  req.userId = claims.userId;
  req.emailVerified = claims.emailVerified;
  next();
}
function requireVerified(req, res, next) {
  if (!req.emailVerified) {
    res.status(403).json({ error: "Email not verified", code: "EMAIL_NOT_VERIFIED" });
    return;
  }
  next();
}
async function registerRoutes(app2) {
  app2.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app2.post("/api/auth/register", async (req, res) => {
    try {
      if (!registerIpLimiter.take(clientIp(req))) {
        res.status(429).json(TOO_MANY);
        return;
      }
      const { email, password, firstName, lastName, dateOfBirth } = req.body ?? {};
      if (typeof email !== "string" || !EMAIL_RE.test(email)) {
        res.status(400).json({ error: "A valid email is required" });
        return;
      }
      if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
      }
      if (typeof firstName !== "string" || !firstName.trim() || typeof lastName !== "string" || !lastName.trim()) {
        res.status(400).json({ error: "First and last name are required" });
        return;
      }
      if (typeof dateOfBirth !== "string" || !isAtLeast18ISO(dateOfBirth)) {
        res.status(400).json({ error: "You must be at least 18 years old" });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const [existing] = await db.select({ id: users.id }).from(users).where(eq4(users.email, normalizedEmail)).limit(1);
      if (existing) {
        res.status(409).json({ error: "An account with this email already exists" });
        return;
      }
      const passwordHash = await hashPassword(password);
      const [created] = await db.insert(users).values({
        email: normalizedEmail,
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth
      }).returning({ id: users.id });
      try {
        const code = await issueCode(created.id, "email_verify");
        await sendVerificationCode(normalizedEmail, code);
      } catch (err) {
        log5.error({ err }, "failed to send verification email on register");
      }
      const token = await signAuthToken(created.id, false);
      res.status(201).json({ token, userId: created.id, emailVerified: false });
    } catch (err) {
      log5.error({ err }, "registration failed");
      res.status(500).json({ error: "Failed to create account" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      if (!loginIpLimiter.take(clientIp(req))) {
        res.status(429).json(TOO_MANY);
        return;
      }
      const { email, password } = req.body ?? {};
      if (typeof email !== "string" || typeof password !== "string") {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!loginEmailLimiter.take(normalizedEmail)) {
        res.status(429).json(TOO_MANY);
        return;
      }
      const [user] = await db.select().from(users).where(eq4(users.email, normalizedEmail)).limit(1);
      const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv");
      if (!user || !ok) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      const token = await signAuthToken(user.id, user.emailVerified);
      res.json({ token, userId: user.id, emailVerified: user.emailVerified });
    } catch (err) {
      log5.error({ err }, "login failed");
      res.status(500).json({ error: "Failed to sign in" });
    }
  });
  app2.post("/api/auth/verify-email", requireAuth, async (req, res) => {
    try {
      const userId = req.userId;
      const { code } = req.body ?? {};
      if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
        res.status(400).json({ error: "Enter the 6-digit code" });
        return;
      }
      const result = await verifyCode(userId, "email_verify", code);
      if (!result.ok) {
        const status = result.reason === "too_many_attempts" ? 429 : 400;
        res.status(status).json({ error: result.reason });
        return;
      }
      await db.update(users).set({ emailVerified: true, updatedAt: sql4`now()` }).where(eq4(users.id, userId));
      const token = await signAuthToken(userId, true);
      res.json({ ok: true, token, emailVerified: true });
    } catch (err) {
      log5.error({ err }, "email verification failed");
      res.status(500).json({ error: "Failed to verify email" });
    }
  });
  app2.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
    try {
      const userId = req.userId;
      if (req.emailVerified) {
        res.json({ ok: true });
        return;
      }
      if (!codeRequestLimiter.take(`verify:${userId}`)) {
        res.status(429).json({ error: "Too many requests \u2014 try again later" });
        return;
      }
      const [user] = await db.select({ email: users.email }).from(users).where(eq4(users.id, userId)).limit(1);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const code = await issueCode(userId, "email_verify");
      await sendVerificationCode(user.email, code);
      res.json({ ok: true });
    } catch (err) {
      log5.error({ err }, "resend verification failed");
      res.status(500).json({ error: "Failed to resend code" });
    }
  });
  app2.post("/api/auth/request-password-reset", async (req, res) => {
    const genericOk = () => res.json({ ok: true });
    try {
      const { email } = req.body ?? {};
      if (typeof email !== "string" || !EMAIL_RE.test(email)) {
        res.status(400).json({ error: "A valid email is required" });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!codeRequestLimiter.take(`reset:${normalizedEmail}`)) {
        genericOk();
        return;
      }
      const [user] = await db.select({ id: users.id }).from(users).where(eq4(users.email, normalizedEmail)).limit(1);
      if (user) {
        const code = await issueCode(user.id, "password_reset");
        await sendPasswordResetCode(normalizedEmail, code);
      }
      genericOk();
    } catch (err) {
      log5.error({ err }, "request password reset failed");
      res.json({ ok: true });
    }
  });
  app2.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, code, newPassword } = req.body ?? {};
      if (typeof email !== "string" || !EMAIL_RE.test(email) || typeof code !== "string" || !/^\d{6}$/.test(code)) {
        res.status(400).json({ error: "Invalid email or code" });
        return;
      }
      if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const [user] = await db.select({ id: users.id }).from(users).where(eq4(users.email, normalizedEmail)).limit(1);
      if (!user) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      const result = await verifyCode(user.id, "password_reset", code);
      if (!result.ok) {
        const status = result.reason === "too_many_attempts" ? 429 : 400;
        res.status(status).json({ error: result.reason });
        return;
      }
      await db.update(users).set({ passwordHash: await hashPassword(newPassword), emailVerified: true, updatedAt: sql4`now()` }).where(eq4(users.id, user.id));
      res.json({ ok: true });
    } catch (err) {
      log5.error({ err }, "reset password failed");
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
  app2.post("/api/auth/change-password", requireAuth, requireVerified, async (req, res) => {
    try {
      const userId = req.userId;
      const { currentPassword, newPassword } = req.body ?? {};
      if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
      }
      const [user] = await db.select().from(users).where(eq4(users.id, userId)).limit(1);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      if (typeof currentPassword !== "string" || !await verifyPassword(currentPassword, user.passwordHash)) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
      await db.update(users).set({ passwordHash: await hashPassword(newPassword), updatedAt: sql4`now()` }).where(eq4(users.id, userId));
      res.json({ ok: true });
    } catch (err) {
      log5.error({ err }, "change password failed");
      res.status(500).json({ error: "Failed to change password" });
    }
  });
  app2.get("/api/rooms", async (_req, res) => {
    try {
      res.json(await getPublicRooms());
    } catch (err) {
      log5.error({ err }, "failed to list rooms");
      res.status(500).json({ error: "Failed to list rooms" });
    }
  });
  app2.get("/api/stats", requireAuth, requireVerified, async (req, res) => {
    try {
      const userId = req.userId;
      const [agg, recent] = await Promise.all([
        db.select({
          wins: sql4`COUNT(*) FILTER (WHERE result = 'win')`,
          losses: sql4`COUNT(*) FILTER (WHERE result = 'loss')`,
          avgScore: sql4`COALESCE(ROUND(AVG(score)), 0)`
        }).from(gameHistory).where(eq4(gameHistory.userId, userId)),
        db.select().from(gameHistory).where(eq4(gameHistory.userId, userId)).orderBy(desc3(gameHistory.playedAt)).limit(10)
      ]);
      const { wins, losses, avgScore } = agg[0] ?? { wins: 0, losses: 0, avgScore: 0 };
      res.json({ wins, losses, avgScore, recent });
    } catch {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });
  app2.get("/api/users/me", requireAuth, async (req, res) => {
    try {
      const userId = req.userId;
      const [profile] = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        dateOfBirth: users.dateOfBirth
      }).from(users).where(eq4(users.id, userId)).limit(1);
      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      res.json(profile);
    } catch {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });
  app2.post("/api/users/profile", requireAuth, requireVerified, async (req, res) => {
    try {
      const userId = req.userId;
      const { firstName, lastName, dateOfBirth } = req.body ?? {};
      if (typeof firstName !== "string" || !firstName.trim() || typeof lastName !== "string" || !lastName.trim()) {
        res.status(400).json({ error: "First and last name are required" });
        return;
      }
      if (typeof dateOfBirth !== "string" || !isAtLeast18ISO(dateOfBirth)) {
        res.status(400).json({ error: "You must be at least 18 years old" });
        return;
      }
      await db.update(users).set({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth,
        updatedAt: sql4`now()`
      }).where(eq4(users.id, userId));
      res.json({ ok: true });
    } catch (err) {
      log5.error({ err }, "failed to save profile");
      res.status(500).json({ error: "Failed to save profile" });
    }
  });
  app2.post("/api/game-history", requireAuth, requireVerified, async (req, res) => {
    try {
      const userId = req.userId;
      const { result, score, opponentScore, mode } = req.body;
      if (result !== "win" && result !== "loss" && result !== "draw" || mode !== "ai" && mode !== "online" || typeof score !== "number" || typeof opponentScore !== "number") {
        res.status(400).json({ error: "Invalid game payload" });
        return;
      }
      const newlyUnlocked = await recordGameAndEvaluate({
        userId,
        result,
        score,
        opponentScore,
        mode
      });
      try {
        await applyGameToTodaysQuests(userId, { result, score, opponentScore, mode });
      } catch (err) {
        log5.error({ err }, "quest progress update failed");
      }
      res.json({ ok: true, newlyUnlocked });
    } catch (err) {
      log5.error({ err }, "failed to save game");
      res.status(500).json({ error: "Failed to save game" });
    }
  });
  app2.get("/api/quests/today", requireAuth, requireVerified, async (req, res) => {
    try {
      const userId = req.userId;
      const { date: date2, quests } = await getTodaysQuests(userId);
      res.json({
        date: date2,
        quests: quests.map(({ def, progress }) => ({
          id: def.id,
          title: def.title,
          description: def.description,
          icon: def.icon,
          xp: def.xp,
          target: def.target,
          progress: progress.progress,
          claimed: progress.claimed,
          claimable: progress.progress >= progress.target && !progress.claimed
        }))
      });
    } catch (err) {
      log5.error({ err }, "failed to fetch quests");
      res.status(500).json({ error: "Failed to fetch quests" });
    }
  });
  app2.post("/api/quests/claim", requireAuth, requireVerified, async (req, res) => {
    try {
      const userId = req.userId;
      const { questId } = req.body ?? {};
      if (typeof questId !== "string" || questId.length === 0) {
        res.status(400).json({ error: "questId required" });
        return;
      }
      const result = await claimQuest(userId, questId);
      if (!result.ok) {
        const code = result.reason === "already_claimed" ? 409 : result.reason === "incomplete" ? 400 : 404;
        res.status(code).json({ error: result.reason });
        return;
      }
      res.json({ ok: true, xp: result.xp });
    } catch (err) {
      log5.error({ err }, "failed to claim quest");
      res.status(500).json({ error: "Failed to claim quest" });
    }
  });
  app2.get("/api/achievements", requireAuth, requireVerified, async (req, res) => {
    try {
      const userId = req.userId;
      const unlockedIds = await listUnlockedAchievementIds(userId);
      const unlockedSet = new Set(unlockedIds);
      const list = ACHIEVEMENTS.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        icon: a.icon,
        xp: a.xp,
        unlocked: unlockedSet.has(a.id)
      }));
      res.json({
        achievements: list,
        totalXp: getAchievementXp(unlockedIds),
        unlockedCount: unlockedIds.length,
        totalCount: ACHIEVEMENTS.length
      });
    } catch (err) {
      log5.error({ err }, "failed to fetch achievements");
      res.status(500).json({ error: "Failed to fetch achievements" });
    }
  });
  app2.get("/api/leaderboard", async (req, res) => {
    try {
      const periodDays = req.query.period === "all" ? null : 7;
      const rows = await db.select({
        userId: gameHistory.userId,
        firstName: users.firstName,
        wins: sql4`COUNT(*) FILTER (WHERE ${gameHistory.result} = 'win')`.as("wins"),
        games: sql4`COUNT(*)`.as("games"),
        avgScore: sql4`COALESCE(ROUND(AVG(${gameHistory.score}))::int, 0)`.as("avgScore")
      }).from(gameHistory).leftJoin(users, eq4(users.id, gameHistory.userId)).where(
        periodDays ? sql4`${gameHistory.playedAt} > now() - interval '${sql4.raw(String(periodDays))} days'` : sql4`true`
      ).groupBy(gameHistory.userId, users.firstName).orderBy(sql4`wins DESC, "avgScore" DESC`).limit(20);
      res.json({
        period: periodDays ? `${periodDays}d` : "all",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          displayName: r.firstName ?? "Player",
          wins: r.wins,
          games: r.games,
          avgScore: r.avgScore
        }))
      });
    } catch (err) {
      log5.error({ err }, "failed to fetch leaderboard");
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });
  const httpServer = createServer(app2);
  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)
  );
  function isOriginAllowed(origin) {
    if (!origin) {
      return true;
    }
    if (allowedOrigins.has(origin)) return true;
    if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:") || origin.startsWith("https://localhost:")) {
      return true;
    }
    return false;
  }
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/",
    verifyClient: ({ origin }, cb) => {
      if (isOriginAllowed(origin)) {
        cb(true);
      } else {
        cb(false, 403, "Forbidden origin");
      }
    }
  });
  wss.on("connection", (ws, request) => {
    handleWebSocket(ws, request);
  });
  return httpServer;
}

// server/index.ts
import * as fs from "fs";
import * as path from "path";
var app = express();
var log6 = logger;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.ALLOWED_ORIGINS) {
      process.env.ALLOWED_ORIGINS.split(",").forEach((d) => {
        origins.add(d.trim());
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      // Only emit one line per request and skip noisy non-API paths.
      autoLogging: {
        ignore: (req) => !(req.url ?? "").startsWith("/api")
      },
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode })
      }
    })
  );
}
function getAppName() {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log6.debug({ baseUrl, expsUrl }, "serving landing page");
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log6.info("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app2.use(express.static(path.resolve(process.cwd(), "static-build")));
  log6.info("Expo routing: checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    logger.error({ err }, "internal server error");
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      // Expo landing page uses inline assets; revisit when CSP is hardened
      crossOriginEmbedderPolicy: false
    })
  );
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    log6.info({ port }, "express server listening");
  });
})();
