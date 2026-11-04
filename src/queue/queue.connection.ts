import Redis from 'ioredis';
import { getRedisOptions } from '../config/redis';
import { logger } from '../utils/logger';

let sharedRedisConnection: Redis | null = null;

export function getQueueRedisConnection(): Redis {
  if (!sharedRedisConnection) {
    const opts = getRedisOptions();
    sharedRedisConnection = new Redis(opts);

    sharedRedisConnection.on('error', (err) => {
      logger.error({ error: err.message }, 'BullMQ shared Redis connection error');
    });
  }

  return sharedRedisConnection;
}

export async function closeQueueRedisConnection(): Promise<void> {
  if (sharedRedisConnection) {
    await sharedRedisConnection.quit().catch(() => {});
    sharedRedisConnection = null;
  }
}

