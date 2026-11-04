import { Request, Response } from 'express';
import { checkDatabaseConnection } from '../../config/database';
import { checkRedisConnection } from '../../config/redis';

export async function healthCheckHandler(_req: Request, res: Response): Promise<void> {
  const [dbHealthy, redisHealthy] = await Promise.all([
    checkDatabaseConnection(),
    checkRedisConnection(),
  ]);

  const allHealthy = dbHealthy && redisHealthy;
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      api: 'up',
      database: dbHealthy ? 'connected' : 'disconnected',
      redis: redisHealthy ? 'connected' : 'disconnected',
    },
  });
}
