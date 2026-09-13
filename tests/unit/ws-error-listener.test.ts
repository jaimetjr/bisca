import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import { handleWebSocket } from '../../server/game-rooms';

vi.mock('../../server/db', () => ({ db: {} }));

// Kept out of heartbeat.test.ts on purpose: that file runs on fake timers, and
// loading the game-rooms module graph under them is slow and flaky.
describe('handleWebSocket', () => {
  it('registers an error listener', () => {
    const ws = new EventEmitter();
    handleWebSocket(ws as unknown as WebSocket);

    // An 'error' event with zero listeners throws in Node and takes the
    // process — and every in-memory room — down with it.
    expect(ws.listenerCount('error')).toBeGreaterThan(0);
    expect(() => ws.emit('error', new Error('ECONNRESET'))).not.toThrow();
  });
});
