interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitOptions {
  capacity: number;
  refillPerMs: number;
}

function tryConsume(bucket: Bucket, opts: RateLimitOptions, cost: number): boolean {
  const now = Date.now();
  const elapsed = now - bucket.updatedAt;
  bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsed * opts.refillPerMs);
  bucket.updatedAt = now;
  if (bucket.tokens < cost) return false;
  bucket.tokens -= cost;
  return true;
}

export function createKeyedRateLimiter(opts: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  return {
    take(key: string, cost = 1): boolean {
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: opts.capacity, updatedAt: Date.now() };
        buckets.set(key, bucket);
      }
      return tryConsume(bucket, opts, cost);
    },
    drop(key: string) {
      buckets.delete(key);
    },
  };
}

export function createObjectRateLimiter<T extends object>(opts: RateLimitOptions) {
  const buckets = new WeakMap<T, Bucket>();
  return {
    take(key: T, cost = 1): boolean {
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: opts.capacity, updatedAt: Date.now() };
        buckets.set(key, bucket);
      }
      return tryConsume(bucket, opts, cost);
    },
  };
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Default: 5 create_room per minute per IP (override with CREATE_ROOM_LIMIT_PER_MIN)
const createRoomPerMin = envInt('CREATE_ROOM_LIMIT_PER_MIN', 5);
export const createRoomLimiter = createKeyedRateLimiter({
  capacity: createRoomPerMin,
  refillPerMs: createRoomPerMin / 60_000,
});

// Default: 30 messages per 10s per connection (override with WS_MSG_LIMIT_PER_10S)
const msgPer10s = envInt('WS_MSG_LIMIT_PER_10S', 30);
export const messageLimiter = createObjectRateLimiter<object>({
  capacity: msgPer10s,
  refillPerMs: msgPer10s / 10_000,
});
