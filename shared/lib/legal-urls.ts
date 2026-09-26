import { getApiUrl } from '../query-client';

// The legal pages are served by the same Express server as the API (see
// server/lib/legal-content.ts), so their URLs derive from the same source of
// truth (EXPO_PUBLIC_DOMAIN via getApiUrl) rather than being hardcoded.
// getApiUrl() returns a trailing-slash base.
//
// Shared between Settings and the sign-up screen so the two cannot drift: a
// user who accepts these at registration must be reading the same pages the
// Settings links open.

export const PRIVACY_URL = `${getApiUrl()}privacy`;
export const TERMS_URL = `${getApiUrl()}terms`;
