import { Queue, Job } from 'bullmq';
import { getQueueRedisConnection } from './queue.connection';
import { WebhookJobData } from '../modules/webhooks/webhook.types';
import { logger } from '../utils/logger';

export const WEBHOOK_QUEUE_NAME = 'webhook-delivery-queue';

export class WebhookQueue {
  private queue: Queue<WebhookJobData> | null = null;

  public getQueue(): Queue<WebhookJobData> {
    if (!this.queue) {
      const connection = getQueueRedisConnection();
      this.queue = new Queue<WebhookJobData>(WEBHOOK_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 1, // We control retries explicitly in the worker with custom exponential backoff & rate limiting
          removeOnComplete: {
            age: 3600, // keep completed jobs for 1 hour
            count: 2000,
          },
          removeOnFail: {
            age: 86400, // keep failed jobs for 24 hours
            count: 5000,
          },
        },
      });

      this.queue.on('error', (err) => {
        logger.error({ error: err.message }, 'WebhookQueue error');
      });
    }

    return this.queue;
  }

  /**
   * Adds a webhook delivery job to the queue.
   */
  async addJob(
    data: WebhookJobData,
    options?: { jobId?: string; delay?: number }
  ): Promise<Job<WebhookJobData>> {
    const q = this.getQueue();
    const job = await q.add('dispatch-webhook', data, {
      jobId: options?.jobId,
      delay: options?.delay ?? 0,
    });

    logger.info(
      {
        jobId: job.id,
        eventId: data.eventId,
        destinationDomain: data.destinationDomain,
        attemptNumber: data.attemptNumber,
        delay: options?.delay ?? 0,
      },
      'Enqueued webhook delivery job'
    );

    return job;
  }

  /**
   * Closes the queue.
   */
  async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }
}

export const webhookQueue = new WebhookQueue();

