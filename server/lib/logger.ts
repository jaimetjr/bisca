import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const level = process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info');

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
});

export type Logger = typeof logger;
