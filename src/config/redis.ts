import Redis, { RedisOptions } from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export function getRedisOptions(): RedisOptions {
  if (env.REDIS_URL) {
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
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
  const client = env.REDIS_URL
    ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
    : new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
      });

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

