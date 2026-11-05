import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';

const router = Router();

// In-memory counter for /mock/flaky?key=X
const flakyMap = new Map<string, number>();

/**
 * Common logging for mock receiver
 */
function logMockRequest(req: Request, target: string) {
  logger.info(
    {
      target,
      method: req.method,
      path: req.originalUrl,
      eventId: req.headers['x-event-id'] || req.headers['x-webhook-event-id'],
      attempt: req.headers['x-delivery-attempt'] || req.headers['x-webhook-attempt'],
      userAgent: req.headers['user-agent'],
      body: req.body,
    },
    `[MockReceiver] Received webhook at ${target}`
  );
}

/**
 * /mock/ok - Always succeeds with 200 OK
 */
router.all('/ok', (req: Request, res: Response) => {
  logMockRequest(req, '/mock/ok');
  res.status(200).json({
    ok: true,
    message: 'Mock endpoint received webhook successfully',
    receivedAt: new Date().toISOString(),
  });
});

/**
 * /mock/fail - Always fails with 500 Internal Server Error
 */
router.all('/fail', (req: Request, res: Response) => {
  logMockRequest(req, '/mock/fail');
  res.status(500).json({
    error: 'Simulated downstream receiver internal server error (500)',
    statusCode: 500,
    receivedAt: new Date().toISOString(),
  });
});

/**
 * /mock/flaky?key=X - Fails with 500 twice, then succeeds with 200 on 3rd attempt
 */
router.all('/flaky', (req: Request, res: Response) => {
  const key =
    (req.query.key as string) ||
    (req.headers['x-event-id'] as string) ||
    (req.headers['x-webhook-event-id'] as string) ||
    'default_flaky_key';

  const count = (flakyMap.get(key) || 0) + 1;
  flakyMap.set(key, count);

  logMockRequest(req, `/mock/flaky [key=${key}, count=${count}]`);

  if (count <= 2) {
    res.status(500).json({
      error: `Simulated flaky failure (attempt ${count} of 2 failed)`,
      attempt: count,
      statusCode: 500,
    });
  } else {
    res.status(200).json({
      ok: true,
      message: `Flaky receiver succeeded on attempt ${count}`,
      attempt: count,
      statusCode: 200,
    });
  }
});

/**
 * /mock/slow - Deliberately delays response for 10 seconds before returning 200 OK
 */
router.all('/slow', async (req: Request, res: Response) => {
  logMockRequest(req, '/mock/slow (starting 10s delay)');
  await new Promise((resolve) => setTimeout(resolve, 10000));
  logMockRequest(req, '/mock/slow (10s delay finished)');

  res.status(200).json({
    ok: true,
    message: 'Mock slow receiver responded after 10-second delay',
    receivedAt: new Date().toISOString(),
  });
});

/**
 * /mock/ratelimit - Returns 429 Too Many Requests with Retry-After: 2 header
 */
router.all('/ratelimit', (req: Request, res: Response) => {
  logMockRequest(req, '/mock/ratelimit');
  res.setHeader('Retry-After', '2');
  res.status(429).json({
    error: 'Simulated downstream rate limit exceeded',
    retryAfterSeconds: 2,
    statusCode: 429,
  });
});

export const mockRoutes = router;

