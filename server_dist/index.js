var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express from "express";
import helmet from "helmet";

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
var clerkToken = z.string().max(4096).optional();
var team = z.union([z.literal(0), z.literal(1)]);
var createRoomSchema = z.object({
  type: z.literal("create_room"),
  playerName,
  maxPlayers: z.number().int().min(2).max(4),
  isPublic: z.boolean().optional(),
  clerkToken
});
var joinRoomSchema = z.object({
  type: z.literal("join_room"),
  roomCode,
  playerName,
  preferredTeam: team.optional(),
  clerkToken
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
    console.error("[redis] client error:", err.message);
  });
  return client;
}

// server/stores/index.ts
var instance;
function getRoomStore() {
  if (instance) return instance;
  const kind = (process.env.ROOM_STORE ?? "memory").toLowerCase();
  if (kind === "redis") {
    instance = new RedisRoomStore(getRedis());
    console.log("[room-store] using Redis backend");
  } else {
    instance = new MemoryRoomStore();
    console.log("[room-store] using in-memory backend");
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
    console.error("[room-cleanup] error:", err);
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
      console.error("[afk-warn] error:", err);
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
      console.error("[afk-forfeit] error:", err);
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
      console.error("[ws-handler] error:", err);
      sendTo(ws, { type: "error", message: "Internal error", code: "INVALID_MESSAGE" });
    });
  });
  ws.on("close", () => {
    void handleClose(ws).catch((err) => console.error("[ws-close] error:", err));
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
        console.error("[disconnect-forfeit] error:", err);
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
          lastActivityAt: Date.now()
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
            console.error("[trick-advance] error:", err);
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
  gameHistory: () => gameHistory,
  insertGameHistorySchema: () => insertGameHistorySchema,
  insertUserProfileSchema: () => insertUserProfileSchema,
  userProfiles: () => userProfiles
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, serial, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var gameHistory = pgTable("game_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clerkUserId: text("clerk_user_id").notNull(),
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

// server/db.ts
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle(pool, { schema: schema_exports });

// server/routes.ts
import { eq, desc, sql as sql2 } from "drizzle-orm";
import { verifyToken } from "@clerk/backend";
var CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? "";
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    req.clerkUserId = payload.sub;
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    res.status(401).json({ error: "Invalid token" });
  }
}
async function registerRoutes(app2) {
  app2.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app2.get("/api/rooms", async (_req, res) => {
    try {
      res.json(await getPublicRooms());
    } catch (err) {
      console.error("Failed to list rooms:", err);
      res.status(500).json({ error: "Failed to list rooms" });
    }
  });
  app2.get("/api/stats", requireAuth, async (req, res) => {
    try {
      const userId = req.clerkUserId;
      const [agg, recent] = await Promise.all([
        db.select({
          wins: sql2`COUNT(*) FILTER (WHERE result = 'win')`,
          losses: sql2`COUNT(*) FILTER (WHERE result = 'loss')`,
          avgScore: sql2`COALESCE(ROUND(AVG(score)), 0)`
        }).from(gameHistory).where(eq(gameHistory.clerkUserId, userId)),
        db.select().from(gameHistory).where(eq(gameHistory.clerkUserId, userId)).orderBy(desc(gameHistory.playedAt)).limit(10)
      ]);
      const { wins, losses, avgScore } = agg[0] ?? { wins: 0, losses: 0, avgScore: 0 };
      res.json({ wins, losses, avgScore, recent });
    } catch {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });
  app2.get("/api/users/me", requireAuth, async (req, res) => {
    try {
      const userId = req.clerkUserId;
      const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.clerkId, userId)).limit(1);
      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      res.json(profile);
    } catch {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });
  app2.post("/api/users/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.clerkUserId;
      const { firstName, lastName, dateOfBirth } = req.body;
      await db.insert(userProfiles).values({ clerkId: userId, firstName, lastName, dateOfBirth }).onConflictDoUpdate({
        target: userProfiles.clerkId,
        set: {
          firstName,
          lastName,
          dateOfBirth,
          updatedAt: sql2`now()`
        }
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("Failed to save profile:", err);
      res.status(500).json({ error: "Failed to save profile" });
    }
  });
  app2.post("/api/game-history", requireAuth, async (req, res) => {
    try {
      const userId = req.clerkUserId;
      const { result, score, opponentScore, mode, aiDifficulty } = req.body;
      await db.insert(gameHistory).values({ clerkUserId: userId, result, score, opponentScore, mode, aiDifficulty });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to save game" });
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
var log = console.log;
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
  app2.use((req, res, next) => {
    const start = Date.now();
    const path2 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path2.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
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
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
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
  log("Serving static Expo files with dynamic manifest routing");
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
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
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
    log(`express server serving on port ${port}`);
  });
})();
