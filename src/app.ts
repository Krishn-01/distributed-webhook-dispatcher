import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { env } from './config/env';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { notFoundMiddleware } from './middleware/not-found.middleware';
import { errorHandler } from './middleware/error.middleware';
import { webhookRoutes } from './modules/webhooks/webhook.routes';
import { healthRoutes } from './modules/health/health.routes';
import { mockRoutes } from './modules/mock/mock.routes';
import { swaggerUiServe, swaggerUiSetup, swaggerJsonHandler } from './docs/swagger';

export function createApp(): Express {
  const app = express();

  // Dynamic CORS configuration via CORS_ORIGIN
  const corsOrigins = env.CORS_ORIGIN === '*'
    ? '*'
    : env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

  app.use(
    cors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Request-ID'],
      credentials: false,
    })
  );

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

  // Core API Routes
  app.use('/health', healthRoutes);
  app.use('/api/webhooks', webhookRoutes);

  // Built-in Mock Receiver for automated grading & live demos
  app.use('/mock', mockRoutes);

  // Static Frontend Assets (single-service deployment)
  const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDistPath));

  // SPA Fallback: serve index.html for non-API client routes
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/docs') ||
      req.path.startsWith('/mock')
    ) {
      return next();
    }
    const indexPath = path.join(frontendDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    next();
  });

  // Fallback 404 and error handling
  app.use(notFoundMiddleware);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
