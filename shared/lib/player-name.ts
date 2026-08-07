import { PLAYER_NAME_MAX_LENGTH } from '../constants/game';

/**
 * The server rejects player names over PLAYER_NAME_MAX_LENGTH (join/create fail
 * with INVALID_MESSAGE). The guest input enforces it with `maxLength`, but a
 * profile-derived full name has no such bound, so clamp before sending.
 */
export function clampPlayerName(raw: string): string {
  return raw.trim().slice(0, PLAYER_NAME_MAX_LENGTH).trim();
}

export interface PlayerNameInput {
  isLoggedIn: boolean;
  /** Full name from the profile, or null while it is still unknown. */
  profileName: string | null;
  /** What a guest typed in. */
  typedName: string;
  /** Localised placeholder, used only when nothing better is available. */
  fallback: string;
}

/**
 * The name a match is started with.
 *
 * Note what happens when a signed-in player's profile has not arrived yet:
 * `profileName` is null and this returns `fallback`. That is correct as a last
 * resort but wrong to *act* on — the value gets baked into the route params and
 * labels the player for the whole match. Callers must wait for
 * `useProfileName().isPending` to clear before starting a game.
 */
export function resolvePlayerName({
  isLoggedIn,
  profileName,
  typedName,
  fallback,
}: PlayerNameInput): string {
  const raw = isLoggedIn ? (profileName ?? '') : typedName;
  return clampPlayerName(raw) || fallback;
}
