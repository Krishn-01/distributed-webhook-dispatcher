import { app } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/database';
import { webhookQueue } from './queue/webhook.queue';
import { closeQueueRedisConnection } from './queue/queue.connection';
import { webhookWorker } from './workers/webhook.worker';

// Start HTTP server
const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      runWorkerInProcess: env.RUN_WORKER_IN_PROCESS,
      docsUrl: `http://localhost:${env.PORT}/docs`,
      healthUrl: `http://localhost:${env.PORT}/health`,
    },
    'Distributed Webhook Dispatcher API server is running'
  );
});

// Single-process deployment: launch BullMQ worker inside API process when enabled
if (env.RUN_WORKER_IN_PROCESS) {
  logger.info('RUN_WORKER_IN_PROCESS is enabled. Starting embedded BullMQ worker.');
  webhookWorker.start();
}

let isShuttingDown = false;

async function handleShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Termination signal received. Starting graceful shutdown...');

  // Stop accepting new HTTP requests
  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      // 1. Close background worker if running in-process
      if (env.RUN_WORKER_IN_PROCESS) {
        logger.info('Stopping in-process webhook worker...');
        await webhookWorker.close();
      }

      // 2. Close BullMQ queue producer
      await webhookQueue.close();

      // 3. Close shared Redis connection
      await closeQueueRedisConnection();

      // 4. Disconnect Prisma database connection
      await prisma.$disconnect();

      logger.info('All database and queue connections closed. Graceful shutdown complete.');
      process.exit(0);
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Error during graceful shutdown');
      process.exit(1);
    }
  });

  // Force close if graceful shutdown hangs beyond 10 seconds
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing process exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
process.on('SIGINT', () => void handleShutdown('SIGINT'));

export { server };
