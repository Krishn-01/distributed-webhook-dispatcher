import Redis from 'ioredis';
import { env } from '../config/env';
import { createRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
}

const SLIDING_WINDOW_LUA_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

-- 1. Remove timestamps outside the sliding window
local clearBefore = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)

-- 2. Count current elements in the window
local currentRequests = redis.call('ZCARD', key)

if currentRequests < limit then
  -- Allowed: Add current timestamp and set TTL
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window + 1000)
  local remaining = limit - currentRequests - 1
  return { 1, 0, remaining }
else
  -- Disallowed: Find oldest timestamp in window to compute retry delay
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestScore = tonumber(oldest[2])
  local retryAfter = (oldestScore + window) - now
  if retryAfter < 50 then
    retryAfter = 50
  end
  return { 0, retryAfter, 0 }
end
`;

export class RateLimiterService {
  private redisClient: Redis | null = null;
  private scriptSha: string | null = null;
  private maxRequests: number;
  private windowMs: number;

  constructor(options?: {
    redisClient?: Redis;
    maxRequests?: number;
    windowMs?: number;
  }) {
    if (options?.redisClient) {
      this.redisClient = options.redisClient;
    }
    this.maxRequests = options?.maxRequests ?? env.RATE_LIMIT_MAX_REQUESTS;
    this.windowMs = options?.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
  }

  private getClient(): Redis {
    if (!this.redisClient) {
      this.redisClient = createRedisClient();
    }
    return this.redisClient;
  }

  /**
   * Checks and acquires rate limit permission for a destination domain.
   * Atomic operation using Redis Lua script.
   */
  async checkDomainRateLimit(domain: string): Promise<RateLimitResult> {
    const client = this.getClient();
    const key = `ratelimit:domain:${domain.toLowerCase()}`;
    const now = Date.now();
    const member = `${now}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      // Use eval for atomic script execution
      const result = (await client.eval(
        SLIDING_WINDOW_LUA_SCRIPT,
        1,
        key,
        now.toString(),
        this.windowMs.toString(),
        this.maxRequests.toString(),
        member
      )) as [number, number, number];

      const allowed = result[0] === 1;
      const retryAfterMs = Number(result[1]);
      const remaining = Number(result[2]);

      if (!allowed) {
        logger.warn(
          {
            domain,
            retryAfterMs,
            limit: this.maxRequests,
            windowMs: this.windowMs,
          },
          'Domain rate limit reached. Deferring job.'
        );
      }

      return {
        allowed,
        retryAfterMs,
        remaining,
      };
    } catch (err) {
      logger.error({ error: (err as Error).message, domain }, 'Error executing rate limiter Lua script');
      // In case of Redis error during rate limiting check, fail safe or allow with warning
      return { allowed: true, retryAfterMs: 0, remaining: 1 };
    }
  }

  async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
      this.redisClient = null;
    }
  }
}

export const rateLimiterService = new RateLimiterService();

