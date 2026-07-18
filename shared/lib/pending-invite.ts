import AsyncStorage from '@react-native-async-storage/async-storage';

// Parks an invite room code while the recipient detours through login /
// registration (AuthGuard bounces unauthenticated users off /join, losing the
// URL). Stored with a TTL: long enough to cover register + email verification,
// short enough that a stale invite doesn't hijack a login days later.

const KEY = '@bisca:pending_invite';
const TTL_MS = 30 * 60_000;

export async function storePendingInvite(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // Storage failure just means the user re-enters the code manually.
  }
}

/** Return the pending room code and clear it; null if none, expired, or malformed. */
export async function consumePendingInvite(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    const { code, at } = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof code !== 'string' || typeof at !== 'number') return null;
    if (Date.now() - at > TTL_MS) return null;
    return /^[A-Z0-9]{4,6}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}
