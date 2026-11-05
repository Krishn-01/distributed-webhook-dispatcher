import { Worker, Job } from 'bullmq';
import { getQueueRedisConnection } from '../queue/queue.connection';
import { WEBHOOK_QUEUE_NAME, webhookQueue } from '../queue/webhook.queue';
import { WebhookJobData } from '../modules/webhooks/webhook.types';
import { webhookRepository } from '../modules/webhooks/webhook.repository';
import { rateLimiterService } from '../services/rate-limiter.service';
import { deliveryService } from '../services/delivery.service';
import { retryService } from '../services/retry.service';
import { WebhookStatus, DeliveryStatus } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export class WebhookWorker {
  private worker: Worker<WebhookJobData> | null = null;
  private isShuttingDown = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  public isRunning(): boolean {
    return this.worker !== null && !this.isShuttingDown;
  }

  public start(): Worker<WebhookJobData> {
    if (this.worker) {
      return this.worker;
    }

    const connection = getQueueRedisConnection();

    this.worker = new Worker<WebhookJobData>(
      WEBHOOK_QUEUE_NAME,
      async (job: Job<WebhookJobData>) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: env.WORKER_CONCURRENCY,
        lockDuration: 30000,
        drainDelay: 30, // Free-tier optimization: poll less aggressively when queue is drained
        stalledInterval: 60000, // Free-tier optimization: reduce stalled lock check frequency
      }
    );

    this.worker.on('ready', () => {
      logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'Webhook background worker started and ready');
      connection.set('bullmq:worker:heartbeat', Date.now().toString(), 'EX', 30).catch(() => {});
    });

    if (!this.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => {
        if (this.worker && !this.isShuttingDown) {
          connection.set('bullmq:worker:heartbeat', Date.now().toString(), 'EX', 30).catch(() => {});
        }
      }, 10000);
    }

    this.worker.on('completed', (job: Job<WebhookJobData>) => {
      logger.info({ jobId: job.id, eventId: job.data.eventId }, 'Webhook job processed completely');
    });

    this.worker.on('failed', (job: Job<WebhookJobData> | undefined, err: Error) => {
      logger.error({ jobId: job?.id, eventId: job?.data.eventId, error: err.message }, 'Webhook job processing failed');
    });

    this.worker.on('error', (err: Error) => {
      logger.error({ error: err.message }, 'BullMQ worker error encountered');
    });

    return this.worker;
  }

  /**
   * Core job processor.
   */
  async processJob(job: Job<WebhookJobData>): Promise<void> {
    const { webhookEventId, eventId, destinationUrl, destinationDomain, payload, attemptNumber } = job.data;

    logger.info(
      {
        jobId: job.id,
        eventId,
        destinationDomain,
        attemptNumber,
      },
      'Processing webhook job'
    );

    // 1. Fetch current event from database
    const event = await webhookRepository.findById(webhookEventId);
    if (!event) {
      logger.warn({ webhookEventId, eventId }, 'Webhook event not found in database. Skipping.');
      return;
    }

    // Idempotency: Skip only if already DELIVERED or permanently FAILED
    // Allows re-running if status is PROCESSING (stalled job recovery)
    if (event.status === WebhookStatus.DELIVERED || event.status === WebhookStatus.FAILED) {
      logger.info(
        { eventId, status: event.status },
        'Webhook already marked DELIVERED or FAILED. Skipping delivery.'
      );
      return;
    }

    const clientJobId = event.jobId || `job_${webhookEventId}`;

    // 2. Destination-domain Rate Limiting Check
    const rateLimit = await rateLimiterService.checkDomainRateLimit(destinationDomain);
    if (!rateLimit.allowed) {
      // Limit exhausted: Re-enqueue job with computed delay without recording a failed attempt
      logger.info(
        {
          eventId,
          destinationDomain,
          retryAfterMs: rateLimit.retryAfterMs,
        },
        'Rate limit exhausted for domain. Deferring job without counting as an attempt.'
      );

      const deferJobId = `${clientJobId}_d_${Date.now()}`;
      await webhookQueue.addJob(job.data, {
        jobId: deferJobId,
        delay: rateLimit.retryAfterMs,
      });
      return;
    }

    // 3. Update status to PROCESSING
    await webhookRepository.updateStatus(webhookEventId, {
      status: WebhookStatus.PROCESSING,
      attemptCount: attemptNumber,
    });

    // 4. Execute Outbound HTTP Delivery
    const deliveryResult = await deliveryService.deliver(
      destinationUrl,
      payload,
      eventId,
      attemptNumber
    );

    // 5. Evaluate Delivery Outcome
    if (deliveryResult.success) {
      // Record successful attempt
      await webhookRepository.recordAttempt({
        webhookEventId,
        attemptNumber,
        status: DeliveryStatus.SUCCESS,
        responseCode: deliveryResult.statusCode,
        errorMessage: null,
        durationMs: deliveryResult.durationMs,
      });

      // Update event status to DELIVERED
      await webhookRepository.updateStatus(webhookEventId, {
        status: WebhookStatus.DELIVERED,
        attemptCount: attemptNumber,
        lastResponseCode: deliveryResult.statusCode,
      });

      logger.info({ eventId, attemptNumber }, 'Webhook delivery succeeded');
      return;
    }

    // 6. Handle Failure & Determine Retry Strategy
    const retryEval = retryService.evaluateRetry(
      attemptNumber,
      deliveryResult.statusCode,
      deliveryResult.errorMessage ? new Error(deliveryResult.errorMessage) : undefined,
      deliveryResult.retryAfterHeader
    );

    if (retryEval.shouldRetry) {
      // Record attempt as RETRYING
      await webhookRepository.recordAttempt({
        webhookEventId,
        attemptNumber,
        status: DeliveryStatus.RETRYING,
        responseCode: deliveryResult.statusCode,
        errorMessage: deliveryResult.errorMessage,
        durationMs: deliveryResult.durationMs,
      });

      // Re-queue for next attempt
      const nextAttemptNumber = attemptNumber + 1;
      await webhookRepository.updateStatus(webhookEventId, {
        status: WebhookStatus.QUEUED,
        attemptCount: attemptNumber,
        lastResponseCode: deliveryResult.statusCode,
      });

      logger.info(
        {
          eventId,
          currentAttempt: attemptNumber,
          nextAttempt: nextAttemptNumber,
          delayMs: retryEval.delayMs,
          reason: retryEval.reason,
        },
        'Scheduling delayed webhook retry'
      );

      const retryJobId = `${clientJobId}_r${nextAttemptNumber}`;
      await webhookQueue.addJob(
        {
          ...job.data,
          attemptNumber: nextAttemptNumber,
        },
        {
          jobId: retryJobId,
          delay: retryEval.delayMs,
        }
      );
    } else {
      // Non-retryable failure or retries exhausted
      await webhookRepository.recordAttempt({
        webhookEventId,
        attemptNumber,
        status: DeliveryStatus.FAILED,
        responseCode: deliveryResult.statusCode,
        errorMessage: deliveryResult.errorMessage,
        durationMs: deliveryResult.durationMs,
      });

      await webhookRepository.updateStatus(webhookEventId, {
        status: WebhookStatus.FAILED,
        attemptCount: attemptNumber,
        lastResponseCode: deliveryResult.statusCode,
      });

      logger.warn(
        {
          eventId,
          attemptNumber,
          statusCode: deliveryResult.statusCode,
          reason: retryEval.reason,
        },
        'Webhook delivery permanently failed'
      );
    }
  }

  /**
   * Graceful shutdown.
   */
  async close(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('Shutting down webhook worker gracefully...');
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await rateLimiterService.close();
    logger.info('Webhook worker stopped');
  }
}

export const webhookWorker = new WebhookWorker();

// Standalone execution entrypoint
if (require.main === module) {
  webhookWorker.start();

  const handleTermination = async (signal: string) => {
    logger.info({ signal }, 'Termination signal received in worker');
    await webhookWorker.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void handleTermination('SIGTERM'));
  process.on('SIGINT', () => void handleTermination('SIGINT'));
}
