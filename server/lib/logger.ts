import pino from 'pino';
import * as Sentry from '@sentry/node';

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const level = process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info');

// Forward error/fatal logs to Sentry (no-op unless SENTRY_DSN is set — see
// ./instrument.ts). Hooking the logger means every existing
// `log.error({ err }, ...)` site (routes, game-rooms, email, GC timers)
// reports to Sentry without per-site wiring. pino-http request-completion
// logs are skipped (they carry req/res and no Error): the route that failed
// already emits its own, more specific error log.
const ERROR_LEVEL = 50; // pino: error=50, fatal=60

function forwardToSentry(args: unknown[], logLevel: number): void {
  if (logLevel < ERROR_LEVEL) return;
  const [first, second] = args;
  const merged = (typeof first === 'object' && first !== null ? first : {}) as Record<string, unknown>;
  if ('req' in merged || 'res' in merged) return;
  const message =
    typeof first === 'string' ? first : typeof second === 'string' ? second : undefined;
  const { err, ...extra } = merged;
  if (err instanceof Error) {
    Sentry.captureException(err, { extra: { ...extra, logMessage: message } });
  } else {
    Sentry.captureMessage(message ?? 'server error (no message)', {
      level: 'error',
      extra: { ...extra, ...(err === undefined ? {} : { err: String(err) }) },
    });
  }
}

/**
 * App-wide structured logger. Use child loggers for module context:
 *   const log = logger.child({ module: 'game-rooms' });
 *   log.info({ roomCode }, 'room created');
 *
 * In tests we silence by default to keep CI output clean. Set LOG_LEVEL=info
 * (or another valid level) to inspect output during a single run.
 */
export const logger = pino({
  level,
  base: { service: 'bisca-server' },
  timestamp: pino.stdTimeFunctions.isoTime,
  hooks: {
    logMethod(args, method, logLevel) {
      // Reporting must never break logging.
      try {
        forwardToSentry(args as unknown[], logLevel);
      } catch {}
      return method.apply(this, args);
    },
  },
});

export type Logger = typeof logger;
