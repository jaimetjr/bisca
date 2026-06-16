import { RoomStore } from './room-store';
import { MemoryRoomStore } from './memory-room-store';
import { RedisRoomStore } from './redis-room-store';
import { getRedis } from '../lib/redis';
import { logger } from '../lib/logger';

const log = logger.child({ module: 'room-store' });

let instance: RoomStore | undefined;

export function getRoomStore(): RoomStore {
  if (instance) return instance;
  const kind = (process.env.ROOM_STORE ?? 'memory').toLowerCase();
  if (kind === 'redis') {
    instance = new RedisRoomStore(getRedis());
    log.info('using Redis backend');
  } else {
    instance = new MemoryRoomStore();
    log.info('using in-memory backend');
  }
  return instance;
}

export function setRoomStoreForTesting(store: RoomStore | undefined): void {
  instance = store;
}

export type { RoomStore } from './room-store';
