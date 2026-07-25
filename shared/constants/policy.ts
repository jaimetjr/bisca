/**
 * Minimum age to create an account.
 *
 * 13 is the general-audience floor: it clears COPPA (US) and keeps the app out
 * of Google Play's "Designed for Families" program, while still being a
 * general-audience (not child-directed) app for AdMob purposes.
 *
 * Single source of truth — the client gate (shared/lib/date.ts), the server
 * gate (server/routes.ts) and the localized error message (auth.errMinAge) all
 * read from here, so the number never drifts between them. Related config that
 * must stay consistent: the AdMob 13+ setup in app/_layout.tsx
 * (maxAdContentRating = T, not child-directed) and the "Target audience"
 * declaration in Play Console.
 */
export const MIN_SIGNUP_AGE = 13;
