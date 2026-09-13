import { describe, it, expect } from 'vitest';
import {
  AFK_TIMEOUT_MS,
  AFK_WARNING_MS,
  LOBBY_IDLE_TIMEOUT_MS,
  LOBBY_IDLE_WARNING_MS,
  LOBBY_DISCONNECT_GRACE_MS,
  ROOM_EXPIRY_MS,
  MATCH_END_TIMEOUT_SECONDS,
  REMATCH_WAIT_SECONDS,
  LOBBY_GONE_REDIRECT_SECONDS,
  CLIENT_PING_INTERVAL_MS,
  CLIENT_PONG_TIMEOUT_MS,
} from '../../shared/constants/game';
import { HEARTBEAT_INTERVAL_MS } from '../../server/connections/heartbeat';

// These constants only work as a set. Each relationship below is one someone
// reasoned about once; without a test, tuning one number quietly breaks another.
describe('online timing constants', () => {
  it('warns before it acts', () => {
    expect(AFK_WARNING_MS).toBeLessThan(AFK_TIMEOUT_MS);
    expect(LOBBY_IDLE_WARNING_MS).toBeLessThan(LOBBY_IDLE_TIMEOUT_MS);
  });

  it('keeps every room timer inside the room lifetime', () => {
    // A room aged out by the inactivity sweep cannot be rescued by a timer
    // that fires later than the sweep.
    expect(LOBBY_DISCONNECT_GRACE_MS).toBeLessThan(ROOM_EXPIRY_MS);
    expect(LOBBY_IDLE_TIMEOUT_MS).toBeLessThan(ROOM_EXPIRY_MS);
  });

  it('gives the rematch wait longer than the screen it is shown on', () => {
    // Asking for a rematch must buy more time than simply sitting there,
    // otherwise pressing Play Again would shorten your stay.
    expect(REMATCH_WAIT_SECONDS).toBeGreaterThan(MATCH_END_TIMEOUT_SECONDS);
  });

  it('leaves the end-of-match screen long enough to read and decide', () => {
    // The host has no clock at all, so a short window here loses them their
    // opponent before they can press Play Again.
    expect(MATCH_END_TIMEOUT_SECONDS).toBeGreaterThanOrEqual(30);
  });

  it('gives a dead-end screen a shorter wait than a screen with a choice', () => {
    expect(LOBBY_GONE_REDIRECT_SECONDS).toBeLessThanOrEqual(MATCH_END_TIMEOUT_SECONDS);
  });

  it('lets the client probe faster than the server reaps', () => {
    // The client must notice a dead socket on its own terms, before the
    // server's sweep terminates it underneath.
    expect(CLIENT_PING_INTERVAL_MS).toBeLessThan(HEARTBEAT_INTERVAL_MS);
    expect(CLIENT_PONG_TIMEOUT_MS).toBeLessThan(CLIENT_PING_INTERVAL_MS);
  });
});
