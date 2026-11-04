import { webhookRepository, WebhookRepository } from './webhook.repository';
import { webhookQueue, WebhookQueue } from '../../queue/webhook.queue';
import { DispatchWebhookDto } from './webhook.schema';
import { WebhookDispatchResponse, WebhookEventDetails, DeliveryAttemptDetails } from './webhook.types';
import { NotFoundError } from '../../utils/app-error';
import { extractDomain } from '../../utils/domain';
import { logger } from '../../utils/logger';

export class WebhookService {
  private repository: WebhookRepository;
  private queue: WebhookQueue;

  constructor(repository = webhookRepository, queue = webhookQueue) {
    this.repository = repository;
    this.queue = queue;
  }

  /**
   * Ingests, validates idempotency, persists, and queues a webhook event for background delivery.
   * Returns immediately with 202 Accepted response format.
   */
  async dispatch(dto: DispatchWebhookDto): Promise<WebhookDispatchResponse> {
    // 1. Idempotency Check: verify if this eventId has already been submitted
    const existing = await this.repository.findByEventId(dto.eventId);
    if (existing) {
      logger.info({ eventId: dto.eventId, existingJobId: existing.jobId }, 'Idempotent dispatch request: event already ingested');
      return {
        status: 'queued',
        jobId: existing.jobId || existing.id,
        eventId: existing.eventId,
      };
    }

    const destinationDomain = extractDomain(dto.destinationUrl);

    // 2. Persist event in PostgreSQL
    const createdEvent = await this.repository.createEvent({
      eventId: dto.eventId,
      destinationUrl: dto.destinationUrl,
      payload: dto.payload,
    });

    const generatedJobId = `job_${createdEvent.id}`;

    // 3. Enqueue delivery job into BullMQ
    const job = await this.queue.addJob(
      {
        webhookEventId: createdEvent.id,
        eventId: createdEvent.eventId,
        destinationUrl: createdEvent.destinationUrl,
        destinationDomain,
        payload: dto.payload,
        attemptNumber: 1, // First delivery attempt
      },
      {
        jobId: generatedJobId,
      }
    );

    // 4. Update event with jobId
    await this.repository.updateJobId(createdEvent.id, job.id as string);

    return {
      status: 'queued',
      jobId: job.id as string,
      eventId: createdEvent.eventId,
    };
  }

  /**
   * Retrieves status and metadata for a specific job/event.
   */
  async getStatusByJobId(jobId: string): Promise<WebhookEventDetails> {
    const event = await this.repository.findByJobId(jobId);
    if (!event) {
      throw new NotFoundError(`Webhook with jobId or id "${jobId}" not found`);
    }

    return {
      id: event.id,
      jobId: event.jobId,
      eventId: event.eventId,
      destinationUrl: event.destinationUrl,
      destinationDomain: event.destinationDomain,
      payload: event.payload,
      status: event.status,
      attemptCount: event.attemptCount,
      lastResponseCode: event.lastResponseCode,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  /**
   * Retrieves chronological delivery attempts for a specific job/event.
   */
  async getAttemptsByJobId(jobId: string): Promise<DeliveryAttemptDetails[]> {
    const event = await this.repository.findByJobId(jobId);
    if (!event) {
      throw new NotFoundError(`Webhook with jobId or id "${jobId}" not found`);
    }

    const attempts = await this.repository.getAttemptsByEventId(event.id);

    return attempts.map((a) => ({
      id: a.id,
      webhookEventId: a.webhookEventId,
      attemptNumber: a.attemptNumber,
      status: a.status,
      responseCode: a.responseCode,
      errorMessage: a.errorMessage,
      durationMs: a.durationMs,
      createdAt: a.createdAt,
    }));
  }
}

export const webhookService = new WebhookService();
