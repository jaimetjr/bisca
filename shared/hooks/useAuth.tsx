import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import { getApiUrl } from '@/shared/query-client';
import { t } from '@/shared/i18n';

// Self-hosted auth, replacing Clerk. A single JWT (issued by the Express
// server) is persisted on the device; its `sub` claim is the user id. The
// surface intentionally mirrors the small slice of Clerk's API the app used:
// { isLoaded, isSignedIn, userId, user, getToken, signIn, signUp, signOut }.

const TOKEN_KEY = 'auth_token';
const isWeb = Platform.OS === 'web';

// SecureStore isn't available on web; fall back to AsyncStorage there.
async function readToken(): Promise<string | null> {
  try {
    return isWeb ? await AsyncStorage.getItem(TOKEN_KEY) : await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}
async function writeToken(value: string): Promise<void> {
  try {
    if (isWeb) await AsyncStorage.setItem(TOKEN_KEY, value);
    else await SecureStore.setItemAsync(TOKEN_KEY, value);
  } catch {
    /* ignore */
  }
}
async function clearToken(): Promise<void> {
  try {
    if (isWeb) await AsyncStorage.removeItem(TOKEN_KEY);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

interface JwtPayload {
  sub?: string;
  exp?: number;
  ev?: boolean;
}

function parseJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** Decode a token's claims if it parses and isn't past its expiry. */
function claimsFromToken(token: string | null): { userId: string; emailVerified: boolean } | null {
  if (!token) return null;
  const payload = parseJwt(token);
  if (!payload?.sub) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return { userId: payload.sub, emailVerified: payload.ev === true };
}

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO YYYY-MM-DD
}

export interface AuthUser {
  id: string;
}

export type AuthResult = { ok: true } | { ok: false; error: string };

interface AuthContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  emailVerified: boolean;
  userId: string | null;
  user: AuthUser | null;
  getToken: () => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (data: SignUpData) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  verifyEmail: (code: string) => Promise<AuthResult>;
  resendVerification: () => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextType>({
  isLoaded: false,
  isSignedIn: false,
  emailVerified: false,
  userId: null,
  user: null,
  getToken: async () => null,
  signIn: async () => ({ ok: false, error: 'Auth not ready' }),
  signUp: async () => ({ ok: false, error: 'Auth not ready' }),
  signOut: async () => {},
  verifyEmail: async () => ({ ok: false, error: 'Auth not ready' }),
  resendVerification: async () => ({ ok: false, error: 'Auth not ready' }),
  requestPasswordReset: async () => ({ ok: false, error: 'Auth not ready' }),
  resetPassword: async () => ({ ok: false, error: 'Auth not ready' }),
});

// Map server error codes from the code endpoints to friendly messages.
function friendlyError(code: unknown): string {
  switch (code) {
    case 'invalid': return 'That code is incorrect';
    case 'expired': return 'That code has expired — request a new one';
    case 'too_many_attempts': return 'Too many attempts — request a new code';
    case 'weak_password': return t('auth.errPasswordWeak');
    case 'password_pwned': return t('auth.errPasswordPwned');
    default: return typeof code === 'string' && code ? code : 'Something went wrong';
  }
}

async function authFetch(
  path: string,
  body: unknown,
  bearer?: string | null,
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${getApiUrl()}api/auth/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: friendlyError(data.error) };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Network error — please try again' };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [claims, setClaims] = useState<{ userId: string; emailVerified: boolean } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await readToken();
      const c = claimsFromToken(stored);
      if (c) {
        setToken(stored);
        setClaims(c);
      } else if (stored) {
        // Expired or malformed — drop it.
        await clearToken();
      }
      setIsLoaded(true);
    })();
  }, []);

  const applyToken = useCallback(async (newToken: string) => {
    await writeToken(newToken);
    setToken(newToken);
    setClaims(claimsFromToken(newToken));
  }, []);

  const getToken = useCallback(async () => token, [token]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const result = await authFetch('login', { email, password });
    if (!result.ok) return result;
    await applyToken(result.data.token);
    return { ok: true };
  }, [applyToken]);

  const signUp = useCallback(async (data: SignUpData): Promise<AuthResult> => {
    const result = await authFetch('register', data);
    if (!result.ok) return result;
    await applyToken(result.data.token);
    return { ok: true };
  }, [applyToken]);

  const verifyEmail = useCallback(async (code: string): Promise<AuthResult> => {
    const result = await authFetch('verify-email', { code }, token);
    if (!result.ok) return result;
    if (result.data.token) await applyToken(result.data.token);
    return { ok: true };
  }, [token, applyToken]);

  const resendVerification = useCallback(async (): Promise<AuthResult> => {
    const result = await authFetch('resend-verification', {}, token);
    return result.ok ? { ok: true } : result;
  }, [token]);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    const result = await authFetch('request-password-reset', { email });
    return result.ok ? { ok: true } : result;
  }, []);

  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string): Promise<AuthResult> => {
      const result = await authFetch('reset-password', { email, code, newPassword });
      return result.ok ? { ok: true } : result;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await clearToken();
    setToken(null);
    setClaims(null);
  }, []);

  const userId = claims?.userId ?? null;

  return (
    <AuthContext.Provider
      value={{
        isLoaded,
        isSignedIn: !!userId,
        emailVerified: claims?.emailVerified ?? false,
        userId,
        user: userId ? { id: userId } : null,
        getToken,
        signIn,
        signUp,
        signOut,
        verifyEmail,
        resendVerification,
        requestPasswordReset,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
