import { app } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/database';
import { webhookQueue } from './queue/webhook.queue';
import { closeQueueRedisConnection } from './queue/queue.connection';

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      docsUrl: `http://localhost:${env.PORT}/docs`,
      healthUrl: `http://localhost:${env.PORT}/health`,
    },
    'Distributed Webhook Dispatcher API server is running'
  );
});

let isShuttingDown = false;

async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Termination signal received. Starting graceful shutdown...');

  // Stop accepting new HTTP requests
  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      // Close BullMQ queue
      await webhookQueue.close();

      // Close Redis connection
      await closeQueueRedisConnection();

      // Disconnect Prisma
      await prisma.$disconnect();

      logger.info('All database and queue connections closed. Shutdown complete.');
      process.exit(0);
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Error during graceful shutdown');
      process.exit(1);
    }
  });

  // Force close if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing process exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
process.on('SIGINT', () => void handleShutdown('SIGINT'));

export { server };

