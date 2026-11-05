import { prisma } from '../../config/database';
import { WebhookStatus, DeliveryStatus, WebhookEvent, DeliveryAttempt, Prisma } from '@prisma/client';
import { extractDomain } from '../../utils/domain';

export class WebhookRepository {
  /**
   * Creates a new WebhookEvent record in the database.
   */
  async createEvent(data: {
    eventId: string;
    destinationUrl: string;
    payload: Record<string, unknown>;
    jobId?: string;
  }): Promise<WebhookEvent> {
    const destinationDomain = extractDomain(data.destinationUrl);

    return prisma.webhookEvent.create({
      data: {
        eventId: data.eventId,
        destinationUrl: data.destinationUrl,
        destinationDomain,
        payload: data.payload as unknown as Prisma.InputJsonValue,
        jobId: data.jobId,
        status: WebhookStatus.QUEUED,
        attemptCount: 0,
      },
    });
  }

  /**
   * Updates the jobId associated with an event.
   */
  async updateJobId(id: string, jobId: string): Promise<WebhookEvent> {
    return prisma.webhookEvent.update({
      where: { id },
      data: { jobId },
    });
  }

  /**
   * Finds a webhook event by its eventId.
   */
  async findByEventId(eventId: string): Promise<WebhookEvent | null> {
    return prisma.webhookEvent.findUnique({
      where: { eventId },
    });
  }

  /**
   * Finds a webhook event by its database id.
   */
  async findById(id: string): Promise<WebhookEvent | null> {
    return prisma.webhookEvent.findUnique({
      where: { id },
    });
  }

  /**
   * Finds a webhook event by its assigned BullMQ jobId.
   */
  async findByJobId(jobId: string): Promise<WebhookEvent | null> {
    return prisma.webhookEvent.findFirst({
      where: {
        OR: [{ jobId }, { id: jobId }],
      },
    });
  }

  /**
   * Updates the status, attemptCount, and lastResponseCode of an event.
   */
  async updateStatus(
    id: string,
    data: {
      status: WebhookStatus;
      attemptCount?: number;
      lastResponseCode?: number | null;
    }
  ): Promise<WebhookEvent> {
    return prisma.webhookEvent.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.attemptCount !== undefined ? { attemptCount: data.attemptCount } : {}),
        ...(data.lastResponseCode !== undefined ? { lastResponseCode: data.lastResponseCode } : {}),
      },
    });
  }

  /**
   * Records a single HTTP delivery attempt in the database.
   */
  async recordAttempt(data: {
    webhookEventId: string;
    attemptNumber: number;
    status: DeliveryStatus;
    responseCode?: number | null;
    errorMessage?: string | null;
    durationMs: number;
  }): Promise<DeliveryAttempt> {
    return prisma.deliveryAttempt.create({
      data: {
        webhookEventId: data.webhookEventId,
        attemptNumber: data.attemptNumber,
        status: data.status,
        responseCode: data.responseCode ?? null,
        errorMessage: data.errorMessage ?? null,
        durationMs: data.durationMs,
      },
    });
  }

  /**
   * Retrieves all delivery attempts for an event ordered chronologically.
   */
  async getAttemptsByEventId(webhookEventId: string): Promise<DeliveryAttempt[]> {
    return prisma.deliveryAttempt.findMany({
      where: { webhookEventId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Retrieves the most recent webhook events.
   */
  async listRecent(limit = 20): Promise<WebhookEvent[]> {
    return prisma.webhookEvent.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const webhookRepository = new WebhookRepository();
