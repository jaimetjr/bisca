import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import { startTestServer, closeServer, createRoom } from './helpers';

// Mock DB and Clerk so the server starts without a real database
vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn().mockRejectedValue(new Error('Invalid token')),
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
});
