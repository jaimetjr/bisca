import { t } from '@/shared/i18n';

// Stable error codes the HTTP API returns in the `code` field (the English
// `error` sentence is kept for older clients). Codes map to i18n keys here so
// every surfaced server error is translated.
const HTTP_CODE_KEYS: Record<string, string> = {
  invalid_email: 'auth.errInvalidEmail',
  name_required: 'auth.errNameRequired',
  under_18: 'auth.errUnder18',
  email_exists: 'auth.errEmailExists',
  invalid_credentials: 'auth.errInvalidCredentials',
  code_required: 'auth.errCodeRequired',
  too_many_requests: 'auth.errTooManyRequests',
  user_not_found: 'auth.errEmailNotFound',
  incorrect_password: 'auth.errPasswordIncorrect',
  weak_password: 'auth.errPasswordWeak',
  password_pwned: 'auth.errPasswordPwned',
  invalid: 'auth.errInvalidCode',
  expired: 'auth.errCodeExpired',
  too_many_attempts: 'auth.errTooManyAttempts',
  server_error: 'auth.errGeneric',
};

/**
 * Translate an API error response body ({ code?, error? }) to a user-facing
 * message. Falls back to a generic translated message — never the server's
 * raw English sentence.
 */
export function friendlyApiError(data: unknown): string {
  if (data && typeof data === 'object') {
    const { code, error } = data as { code?: unknown; error?: unknown };
    // Older responses carry code-shaped values in `error` itself.
    for (const value of [code, error]) {
      if (typeof value === 'string' && HTTP_CODE_KEYS[value]) {
        return t(HTTP_CODE_KEYS[value]);
      }
    }
  }
  return t('auth.errGeneric');
}

// WebSocket error codes (server/game-rooms.ts) → i18n keys.
const WS_CODE_KEYS: Record<string, string> = {
  ROOM_NOT_FOUND: 'ws.roomNotFound',
  RATE_LIMITED: 'ws.rateLimited',
  INVALID_MESSAGE: 'ws.invalidMessage',
  GAME_ALREADY_STARTED: 'ws.gameAlreadyStarted',
  ROOM_FULL: 'ws.roomFull',
  NOT_HOST: 'ws.notHost',
  NEED_MORE_PLAYERS: 'ws.needMorePlayers',
  INVALID_TOKEN: 'ws.invalidToken',
  NOT_YOUR_TURN: 'ws.notYourTurn',
  INVALID_CARD: 'ws.invalidCard',
  MUST_FOLLOW_SUIT: 'ws.mustFollowSuit',
};

/** Translate a WS error by its code, falling back to the server's message. */
export function wsErrorText(code: unknown, message?: unknown): string {
  if (typeof code === 'string' && WS_CODE_KEYS[code]) return t(WS_CODE_KEYS[code]);
  if (typeof message === 'string' && message) return message;
  return t('ws.invalidMessage');
}
