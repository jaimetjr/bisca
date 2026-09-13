import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket, WebSocketServer } from 'ws';
import { startHeartbeat } from '../../server/connections/heartbeat';

vi.mock('../../server/db', () => ({ db: {} }));

/** Minimum of the ws API the sweep touches. */
class FakeSocket extends EventEmitter {
  ping = vi.fn();
  terminate = vi.fn();
}

class FakeServer extends EventEmitter {
  clients = new Set<FakeSocket>();
  add(ws: FakeSocket) {
    this.clients.add(ws);
    this.emit('connection', ws);
  }
}

const INTERVAL = 1000;

let wss: FakeServer;
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  wss = new FakeServer();
  stop = startHeartbeat(wss as unknown as WebSocketServer, INTERVAL);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('startHeartbeat', () => {
  it('pings a live socket on the first sweep', () => {
    const ws = new FakeSocket();
    wss.add(ws);

    vi.advanceTimersByTime(INTERVAL);

    expect(ws.ping).toHaveBeenCalledTimes(1);
    expect(ws.terminate).not.toHaveBeenCalled();
  });

  it('terminates a socket that never pongs back', () => {
    const ws = new FakeSocket();
    wss.add(ws);

    vi.advanceTimersByTime(INTERVAL);      // pinged, liveness cleared
    vi.advanceTimersByTime(INTERVAL);      // no pong arrived

    expect(ws.terminate).toHaveBeenCalledTimes(1);
  });

  it('never terminates a socket that keeps ponging', () => {
    const ws = new FakeSocket();
    ws.ping.mockImplementation(() => ws.emit('pong'));
    wss.add(ws);

    for (let i = 0; i < 10; i++) vi.advanceTimersByTime(INTERVAL);

    expect(ws.terminate).not.toHaveBeenCalled();
    expect(ws.ping).toHaveBeenCalledTimes(10);
  });

  it('survives a ping throwing on a half-closed socket', () => {
    const ws = new FakeSocket();
    ws.ping.mockImplementation(() => { throw new Error('not opened'); });
    wss.add(ws);

    expect(() => vi.advanceTimersByTime(INTERVAL)).not.toThrow();
  });

  it('stops sweeping once stopped', () => {
    const ws = new FakeSocket();
    wss.add(ws);
    stop();

    vi.advanceTimersByTime(INTERVAL * 5);

    expect(ws.ping).not.toHaveBeenCalled();
    expect(ws.terminate).not.toHaveBeenCalled();
  });

  it('stops when the server closes', () => {
    const ws = new FakeSocket();
    wss.add(ws);
    wss.emit('close');

    vi.advanceTimersByTime(INTERVAL * 5);

    expect(ws.ping).not.toHaveBeenCalled();
  });
});
