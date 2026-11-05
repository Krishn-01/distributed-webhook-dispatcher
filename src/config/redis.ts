import Redis, { RedisOptions } from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export function getRedisOptions(): RedisOptions {
  if (env.REDIS_URL) {
    try {
      const parsed = new URL(env.REDIS_URL);
      const isTls = parsed.protocol === 'rediss:';
      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : (isTls ? 6380 : 6379),
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        tls: isTls ? { rejectUnauthorized: false } : undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };
    } catch {
      // fallback
    }
  }

  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export function createRedisClient(): Redis {
  const opts = getRedisOptions();
  const client = new Redis(opts);

  client.on('error', (err) => {
    logger.error({ error: err.message }, 'Redis client connection error');
  });

  return client;
}

export async function checkRedisConnection(client?: Redis): Promise<boolean> {
  let redisClient = client;
  let shouldQuit = false;

  try {
    if (!redisClient) {
      redisClient = createRedisClient();
      shouldQuit = true;
    }
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Redis health check failed');
    return false;
  } finally {
    if (shouldQuit && redisClient) {
      await redisClient.quit().catch(() => {});
    }
  }
}
