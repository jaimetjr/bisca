import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — covers full match + reconnect grace

function getSecret(): string {
  const secret = process.env.RECONNECT_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('RECONNECT_TOKEN_SECRET must be set to a value of at least 16 characters');
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function issueReconnectToken(playerId: string, roomCode: string): string {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${playerId}.${roomCode}.${expiresAt}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export interface ReconnectTokenClaims {
  playerId: string;
  roomCode: string;
  expiresAt: number;
}

export function verifyReconnectToken(token: string): ReconnectTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [playerId, roomCode, expiresAtStr, sig] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;

  const expected = sign(`${playerId}.${roomCode}.${expiresAt}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { playerId, roomCode, expiresAt };
}
