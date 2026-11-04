import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const requestId = req.id || 'unknown';

  if (err instanceof AppError) {
    logger.warn(
      {
        requestId,
        path: req.originalUrl,
        statusCode: err.statusCode,
        error: err.message,
        details: err.details,
      },
      'Operational error encountered'
    );

    res.status(err.statusCode).json({
      error: {
        message: err.message,
        statusCode: err.statusCode,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const formatted = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    logger.warn({ requestId, path: req.originalUrl, validationErrors: formatted }, 'Request validation failed');

    res.status(400).json({
      error: {
        message: 'Invalid request payload',
        statusCode: 400,
        details: formatted,
      },
    });
    return;
  }

  // Body parser syntax error
  if ('type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      error: {
        message: 'Malformed JSON payload',
        statusCode: 400,
      },
    });
    return;
  }

  logger.error(
    {
      requestId,
      path: req.originalUrl,
      error: err.message,
      stack: err.stack,
    },
    'Unhandled server error'
  );

  res.status(500).json({
    error: {
      message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      statusCode: 500,
    },
  });
}

