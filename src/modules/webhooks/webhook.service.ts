import { webhookRepository, WebhookRepository } from './webhook.repository';
import { webhookQueue, WebhookQueue } from '../../queue/webhook.queue';
import { DispatchWebhookDto } from './webhook.schema';
import { WebhookDispatchResponse, WebhookEventDetails, DeliveryAttemptDetails } from './webhook.types';
import { NotFoundError, ConflictError, AppError } from '../../utils/app-error';
import { extractDomain } from '../../utils/domain';
import { logger } from '../../utils/logger';
import { WebhookStatus, DeliveryStatus } from '@prisma/client';

function arePayloadsEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

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
   *
   * Idempotency:
   * - Same eventId, same payload and destinationUrl: returns 202 with existing jobId.
   * - Same eventId, different payload or destinationUrl: throws 409 Conflict.
   * - Concurrent requests: catches Prisma P2002 and performs the same comparison.
   *
   * Enqueue failure:
   * - If Redis enqueue fails after DB insert, marks event as FAILED and returns 503.
   */
  async dispatch(dto: DispatchWebhookDto): Promise<WebhookDispatchResponse> {
    // 1. Pre-check idempotency: verify if this eventId has already been submitted
    const existing = await this.repository.findByEventId(dto.eventId);
    if (existing) {
      if (
        existing.destinationUrl !== dto.destinationUrl ||
        !arePayloadsEqual(existing.payload, dto.payload)
      ) {
        throw new ConflictError(
          `Webhook eventId "${dto.eventId}" already exists with different destinationUrl or payload`
        );
      }

      logger.info({ eventId: dto.eventId, existingJobId: existing.jobId }, 'Idempotent dispatch request: event already ingested');
      return {
        status: 'queued',
        jobId: existing.jobId || existing.id,
        eventId: existing.eventId,
      };
    }

    const destinationDomain = extractDomain(dto.destinationUrl);

    // 2. Persist event in PostgreSQL (catching concurrent P2002 if race condition occurs)
    let createdEvent;
    try {
      createdEvent = await this.repository.createEvent({
        eventId: dto.eventId,
        destinationUrl: dto.destinationUrl,
        payload: dto.payload,
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        const concurrent = await this.repository.findByEventId(dto.eventId);
        if (concurrent) {
          if (
            concurrent.destinationUrl !== dto.destinationUrl ||
            !arePayloadsEqual(concurrent.payload, dto.payload)
          ) {
            throw new ConflictError(
              `Webhook eventId "${dto.eventId}" already exists with different destinationUrl or payload`
            );
          }
          return {
            status: 'queued',
            jobId: concurrent.jobId || concurrent.id,
            eventId: concurrent.eventId,
          };
        }
      }
      throw err;
    }

    const generatedJobId = `job_${createdEvent.id}`;

    // 3. Enqueue delivery job into BullMQ
    let job;
    try {
      job = await this.queue.addJob(
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
    } catch (enqueueErr) {
      const errMsg = (enqueueErr as Error).message || 'Redis enqueue failed';
      logger.error(
        { eventId: dto.eventId, error: errMsg },
        'Redis enqueue failed after database insert. Marking event FAILED.'
      );

      // Never leave event in QUEUED when enqueue fails
      await this.repository.updateStatus(createdEvent.id, {
        status: WebhookStatus.FAILED,
        lastResponseCode: null,
      });
      await this.repository.recordAttempt({
        webhookEventId: createdEvent.id,
        attemptNumber: 0,
        status: DeliveryStatus.FAILED,
        responseCode: null,
        errorMessage: `Enqueue failed: ${errMsg}`,
        durationMs: 0,
      });

      throw new AppError('Failed to enqueue webhook delivery job. Service temporarily unavailable.', 503);
    }

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

  /**
   * Retrieves latest 20 webhook events.
   */
  async getRecent(limit = 20): Promise<WebhookEventDetails[]> {
    const events = await this.repository.listRecent(limit);
    return events.map((event) => ({
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
    }));
  }
}

export const webhookService = new WebhookService();
