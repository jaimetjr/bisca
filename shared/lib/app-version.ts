import Constants from 'expo-constants';

/**
 * This build's version, as declared in app.json.
 *
 * Client-only: it imports `expo-constants`, so the server must never reach it.
 * The comparison itself lives in `shared/lib/version.ts`, which both sides use.
 *
 * Sent on the messages that enter an online room so the server can turn away
 * builds too old for the protocol. Undefined here reads as "oldest possible"
 * server-side, which is the honest reading — a build that cannot state its own
 * version cannot be vouched for.
 */
export function getAppVersion(): string | undefined {
  return Constants.expoConfig?.version ?? undefined;
}
