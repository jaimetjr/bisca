import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import { startTestServer, closeServer, createRoom } from './helpers';

// Mock the DB so the server starts without a real database.
// Builder chain returns an empty array at every reasonable terminal node.
const emptyArray = Promise.resolve([]);
function makeChain(): Record<string, unknown> {
  // Chainable builder; "then" makes it awaitable so `await db.select()...` resolves to [].
  const chain: Record<string, unknown> = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    groupBy: () => chain,
    orderBy: () => chain,
    limit: () => emptyArray,
    then: (onFulfilled: (v: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) =>
      emptyArray.then(onFulfilled, onRejected),
  };
  return chain;
}

function makeMutationChain(): Record<string, unknown> {
  // Chainable for update/set/where; awaiting at any point resolves to undefined.
  const c: Record<string, unknown> = {
    set: () => c,
    where: () => c,
    then: (cb: (v: undefined) => unknown) => Promise.resolve(undefined).then(cb),
  };
  return c;
}

vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(() => makeChain()),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        then: (cb: (v: undefined) => unknown) => Promise.resolve(undefined).then(cb),
      }),
    }),
    update: vi.fn(() => makeMutationChain()),
  },
}));

let server: Server;
let port: number;
let wsUrl: string;

beforeAll(async () => {
  ({ server, port, wsUrl } = await startTestServer());
});

afterAll(async () => {
  await closeServer(server);
});

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(server).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/rooms', () => {
  it('returns 200 with an array', async () => {
    const res = await request(server).get('/api/rooms');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('lists a newly created public room', async () => {
    const { ws, roomCode } = await createRoom(wsUrl, 'TestHost', 2, true);

    const res = await request(server).get('/api/rooms');
    expect(res.status).toBe(200);
    const room = res.body.find((r: { code: string }) => r.code === roomCode);
    expect(room).toBeDefined();
    expect(room.hostName).toBe('TestHost');
    expect(room.maxPlayers).toBe(2);
    expect(room.currentPlayers).toBe(1);

    ws.close();
  });

  it('does not list a private room', async () => {
    const { ws, roomCode } = await createRoom(wsUrl, 'PrivateHost', 2, false);

    const res = await request(server).get('/api/rooms');
    const room = res.body.find((r: { code: string }) => r.code === roomCode);
    expect(room).toBeUndefined();

    ws.close();
  });
});

describe('Auth-required endpoints', () => {
  it('GET /api/stats returns 401 without token', async () => {
    const res = await request(server).get('/api/stats');
    expect(res.status).toBe(401);
  });

  it('GET /api/users/me returns 401 without token', async () => {
    const res = await request(server).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('POST /api/users/profile returns 401 without token', async () => {
    const res = await request(server).post('/api/users/profile').send({});
    expect(res.status).toBe(401);
  });

  it('POST /api/game-history returns 401 without token', async () => {
    const res = await request(server).post('/api/game-history').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/achievements returns 401 without token', async () => {
    const res = await request(server).get('/api/achievements');
    expect(res.status).toBe(401);
  });

  it('GET /api/quests/today returns 401 without token', async () => {
    const res = await request(server).get('/api/quests/today');
    expect(res.status).toBe(401);
  });

  it('POST /api/quests/claim returns 401 without token', async () => {
    const res = await request(server).post('/api/quests/claim').send({ questId: 'play_3' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/leaderboard (public)', () => {
  it('returns 200 with entries array', async () => {
    const res = await request(server).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.period).toBe('7d');
  });

  it('honours ?period=all', async () => {
    const res = await request(server).get('/api/leaderboard?period=all');
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('all');
  });
});

describe('GET /join/:code (invite landing page)', () => {
  it('renders the invite page with code, deep link, and store link', async () => {
    const { ws, roomCode } = await createRoom(wsUrl);
    try {
      const res = await request(server).get(`/join/${roomCode.toLowerCase()}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      // Code is normalized to uppercase and shown for manual entry
      expect(res.text).toContain(roomCode);
      // "Open in app" deep link (expo triple-slash form)
      expect(res.text).toContain(`bisca:///join?code=${roomCode}`);
      // "Get the app" store link
      expect(res.text).toContain('play.google.com/store/apps/details?id=com.jaimetjr.bisca');
    } finally {
      ws.close();
    }
  });

  it('serves the page in the language the recipient reads', async () => {
    const { ws, roomCode } = await createRoom(wsUrl);
    try {
      const res = await request(server)
        .get(`/join/${roomCode}`)
        .set('Accept-Language', 'it-IT,it;q=0.9');
      expect(res.status).toBe(200);
      expect(res.text).toContain('lang="it"');
      expect(res.headers['vary']).toMatch(/Accept-Language/i);
    } finally {
      ws.close();
    }
  });

  it('does not promise an invite for a room that does not exist', async () => {
    const res = await request(server).get('/join/ZZZZZ');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    // Nothing to open, so no deep link is offered
    expect(res.text).not.toContain('bisca:///join');
    // But installing the app is still worth offering
    expect(res.text).toContain('play.google.com/store/apps/details?id=com.jaimetjr.bisca');
  });

  it('rejects malformed codes with 404', async () => {
    for (const bad of ['abc', 'toolong7', 'WD%20K7', '<script>']) {
      const res = await request(server).get(`/join/${bad}`);
      expect(res.status, `code: ${bad}`).toBe(404);
    }
  });
});
