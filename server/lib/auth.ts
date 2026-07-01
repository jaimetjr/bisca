import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

// Self-hosted auth primitives: password hashing + signed session tokens.
// Replaces Clerk. Tokens are HS256 JWTs whose subject is the user id.

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = '30d';

let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET must be set to a random string of at least 16 characters');
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface AuthClaims {
  userId: string;
  emailVerified: boolean;
}

export function signAuthToken(userId: string, emailVerified: boolean): Promise<string> {
  return new SignJWT({ ev: emailVerified })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecret());
}

/** Returns the claims from a valid token, or null if invalid/expired. */
export async function verifyAuthToken(token: string): Promise<AuthClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== 'string') return null;
    return { userId: payload.sub, emailVerified: payload.ev === true };
  } catch {
    return null;
  }
}
