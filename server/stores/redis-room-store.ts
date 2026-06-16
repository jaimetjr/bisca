import type { Redis } from 'ioredis';
import { Room } from '../models/room';
import { RoomStore } from './room-store';
import { ROOM_EXPIRY_MS } from '../../shared/constants/game';

const KEY_PREFIX = 'bisca:room:';
const INDEX_KEY = 'bisca:rooms:index';
const TTL_SECONDS = Math.ceil(ROOM_EXPIRY_MS / 1000) + 60;

function key(code: string): string {
  return `${KEY_PREFIX}${code}`;
}

export class RedisRoomStore implements RoomStore {
  constructor(private readonly redis: Redis) {}

  async get(code: string): Promise<Room | undefined> {
    const raw = await this.redis.get(key(code));
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as Room;
    } catch {
      return undefined;
    }
  }

  async set(room: Room): Promise<void> {
    const payload = JSON.stringify(room);
    await this.redis
      .multi()
      .set(key(room.code), payload, 'EX', TTL_SECONDS)
      .sadd(INDEX_KEY, room.code)
      .exec();
  }

  async setIfAbsent(room: Room): Promise<boolean> {
    const payload = JSON.stringify(room);
    const result = await this.redis.set(key(room.code), payload, 'EX', TTL_SECONDS, 'NX');
    if (result !== 'OK') return false;
    await this.redis.sadd(INDEX_KEY, room.code);
    return true;
  }

  async delete(code: string): Promise<void> {
    await this.redis
      .multi()
      .del(key(code))
      .srem(INDEX_KEY, code)
      .exec();
  }

  async list(): Promise<Room[]> {
    const codes = await this.redis.smembers(INDEX_KEY);
    if (codes.length === 0) return [];
    const keys = codes.map(key);
    const values = await this.redis.mget(...keys);
    const rooms: Room[] = [];
    const stale: string[] = [];
    for (let i = 0; i < codes.length; i++) {
      const raw = values[i];
      if (!raw) {
        stale.push(codes[i]);
        continue;
      }
      try {
        rooms.push(JSON.parse(raw) as Room);
      } catch {
        stale.push(codes[i]);
      }
    }
    if (stale.length > 0) {
      await this.redis.srem(INDEX_KEY, ...stale);
    }
    return rooms;
  }
}
