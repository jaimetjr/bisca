import IORedis, { type Redis } from 'ioredis';
import { logger } from './logger';

const log = logger.child({ module: 'redis' });

let client: Redis | undefined;

export function getRedis(): Redis {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL must be set when ROOM_STORE=redis');
  }
  client = new IORedis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });
  client.on('error', (err) => {
    log.error({ err: err.message }, 'redis client error');
  });
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = undefined;
  }
}
