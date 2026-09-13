import { useCallback, useEffect, useRef } from 'react';
import { CLIENT_PING_INTERVAL_MS, CLIENT_PONG_TIMEOUT_MS } from '@/shared/constants/game';
import { useForegroundLiveness } from './useForegroundLiveness';

/**
 * Probes a socket with an app-level ping and reports when it stops answering.
 * A backgrounded socket often still reads OPEN, so only an unanswered write
 * reveals it. The caller must call `notePong` when a `pong` arrives.
 */
export function useSocketLiveness(opts: {
  getSocket: () => WebSocket | null;
  onDead: () => void;
  enabled?: boolean;
}) {
  const { getSocket, onDead, enabled = true } = opts;

  const onDeadRef = useRef(onDead);
  onDeadRef.current = onDead;
  const getSocketRef = useRef(getSocket);
  getSocketRef.current = getSocket;

  const waitingRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    waitingRef.current = false;
  }, []);

  const notePong = useCallback(() => clearWatchdog(), [clearWatchdog]);

  const probe = useCallback(() => {
    if (!enabled) return;
    const ws = getSocketRef.current();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      onDeadRef.current();
      return;
    }
    if (waitingRef.current) return;
    try {
      ws.send(JSON.stringify({ type: 'ping' }));
    } catch {
      onDeadRef.current();
      return;
    }
    waitingRef.current = true;
    watchdogRef.current = setTimeout(() => {
      watchdogRef.current = null;
      if (!waitingRef.current) return;
      waitingRef.current = false;
      onDeadRef.current();
    }, CLIENT_PONG_TIMEOUT_MS);
  }, [enabled]);

  useForegroundLiveness(probe);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(probe, CLIENT_PING_INTERVAL_MS);
    return () => {
      clearInterval(id);
      clearWatchdog();
    };
  }, [enabled, probe, clearWatchdog]);

  return { notePong, probe };
}
