import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ROOM_EXPIRY_MS } from '@/shared/constants/game';

// SecureStore rejects keys outside [A-Za-z0-9._-], so no '@bisca:' prefix here.
const KEY = 'bisca_room_session';
const isWeb = Platform.OS === 'web';

// Past this the server has dropped the room, so a stored session is useless.
const TTL_MS = ROOM_EXPIRY_MS;

export interface RoomSession {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
  playerName: string;
  maxPlayers: number;
  isHost: boolean;
  savedAt: number;
}

async function readRaw(): Promise<string | null> {
  try {
    return isWeb ? await AsyncStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveRoomSession(s: Omit<RoomSession, 'savedAt'>): Promise<void> {
  try {
    const payload: RoomSession = { ...s, savedAt: Date.now() };
    const json = JSON.stringify(payload);
    if (isWeb) await AsyncStorage.setItem(KEY, json);
    else await SecureStore.setItemAsync(KEY, json);
  } catch { /* ignore */ }
}

/** The stored session, or null if absent, expired, or malformed. */
export async function loadRoomSession(): Promise<RoomSession | null> {
  const raw = await readRaw();
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<RoomSession>;
    if (
      typeof s.roomCode !== 'string' ||
      typeof s.playerId !== 'string' ||
      typeof s.reconnectToken !== 'string' ||
      typeof s.savedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - s.savedAt > TTL_MS) return null;
    return {
      roomCode: s.roomCode,
      playerId: s.playerId,
      reconnectToken: s.reconnectToken,
      playerName: typeof s.playerName === 'string' ? s.playerName : '',
      maxPlayers: typeof s.maxPlayers === 'number' ? s.maxPlayers : 2,
      isHost: s.isHost === true,
      savedAt: s.savedAt,
    };
  } catch {
    return null;
  }
}

export async function clearRoomSession(): Promise<void> {
  try {
    if (isWeb) await AsyncStorage.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* ignore */
  }
}
