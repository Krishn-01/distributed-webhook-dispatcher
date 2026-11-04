import express, { Express } from 'express';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { notFoundMiddleware } from './middleware/not-found.middleware';
import { errorHandler } from './middleware/error.middleware';
import { webhookRoutes } from './modules/webhooks/webhook.routes';
import { healthRoutes } from './modules/health/health.routes';
import { swaggerUiServe, swaggerUiSetup, swaggerJsonHandler } from './docs/swagger';

export function createApp(): Express {
  const app = express();

  // Basic security and parsing
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request tracing
  app.use(requestIdMiddleware);

  // Structured HTTP logging (skip healthchecks in debug/prod to avoid noise)
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/health',
      },
      genReqId: (req) => req.id || 'unknown',
    })
  );

  // Documentation
  app.use('/docs', swaggerUiServe, swaggerUiSetup);
  app.get('/docs.json', swaggerJsonHandler);

  // API Routes
  app.use('/health', healthRoutes);
  app.use('/api/webhooks', webhookRoutes);

  // Fallback 404 and error handling
  app.use(notFoundMiddleware);
  app.use(errorHandler);

  return app;
}

export const app = createApp();

