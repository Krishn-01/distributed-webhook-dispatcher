import { WebhookWorker } from '../../src/workers/webhook.worker';
import { webhookRepository } from '../../src/modules/webhooks/webhook.repository';
import { rateLimiterService } from '../../src/services/rate-limiter.service';
import { deliveryService } from '../../src/services/delivery.service';
import { webhookQueue } from '../../src/queue/webhook.queue';
import { WebhookStatus, DeliveryStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { WebhookJobData } from '../../src/modules/webhooks/webhook.types';

jest.mock('../../src/modules/webhooks/webhook.repository');
jest.mock('../../src/services/rate-limiter.service');
jest.mock('../../src/services/delivery.service');
jest.mock('../../src/queue/webhook.queue');

describe('Worker Processing & Orchestration Integration Tests', () => {
  let worker: WebhookWorker;
  const mockedRepo = webhookRepository as jest.Mocked<typeof webhookRepository>;
  const mockedRateLimiter = rateLimiterService as jest.Mocked<typeof rateLimiterService>;
  const mockedDelivery = deliveryService as jest.Mocked<typeof deliveryService>;
  const mockedQueue = webhookQueue as jest.Mocked<typeof webhookQueue>;

  beforeEach(() => {
    jest.clearAllMocks();
    worker = new WebhookWorker();
  });

  const createMockJob = (attemptNumber = 1): Job<WebhookJobData> =>
    ({
      id: 'bullmq-job-1',
      data: {
        webhookEventId: 'event-uuid-1',
        eventId: 'evt_test_100',
        destinationUrl: 'https://client.site/webhook',
        destinationDomain: 'client.site',
        payload: { user: 'test' },
        attemptNumber,
      },
    } as unknown as Job<WebhookJobData>);

  it('REQ-07 & REQ-11: should process job, deliver successfully, and mark DELIVERED', async () => {
    mockedRepo.findById.mockResolvedValueOnce({
      id: 'event-uuid-1',
      eventId: 'evt_test_100',
      destinationUrl: 'https://client.site/webhook',
      destinationDomain: 'client.site',
      payload: {},
      status: WebhookStatus.QUEUED,
      jobId: 'bullmq-job-1',
      attemptCount: 0,
      lastResponseCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockedRateLimiter.checkDomainRateLimit.mockResolvedValueOnce({
      allowed: true,
      retryAfterMs: 0,
      remaining: 9,
    });

    mockedDelivery.deliver.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      durationMs: 45,
      errorMessage: null,
    });

    const job = createMockJob(1);
    await worker.processJob(job);

    // 1. Should transition to PROCESSING then DELIVERED
    expect(mockedRepo.updateStatus).toHaveBeenCalledWith('event-uuid-1', {
      status: WebhookStatus.PROCESSING,
      attemptCount: 1,
    });
    expect(mockedRepo.updateStatus).toHaveBeenCalledWith('event-uuid-1', {
      status: WebhookStatus.DELIVERED,
      attemptCount: 1,
      lastResponseCode: 200,
    });

    // 2. Should persist DeliveryAttempt with SUCCESS
    expect(mockedRepo.recordAttempt).toHaveBeenCalledWith({
      webhookEventId: 'event-uuid-1',
      attemptNumber: 1,
      status: DeliveryStatus.SUCCESS,
      responseCode: 200,
      errorMessage: null,
      durationMs: 45,
    });

    // 3. Should not schedule retry
    expect(mockedQueue.addJob).not.toHaveBeenCalled();
  });

  it('REQ-08 & REQ-09: should handle HTTP 500 failure, log RETRYING, and re-enqueue with 2s delay', async () => {
    mockedRepo.findById.mockResolvedValueOnce({
      id: 'event-uuid-1',
      eventId: 'evt_test_100',
      destinationUrl: 'https://client.site/webhook',
      destinationDomain: 'client.site',
      payload: {},
      status: WebhookStatus.QUEUED,
      jobId: 'bullmq-job-1',
      attemptCount: 0,
      lastResponseCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockedRateLimiter.checkDomainRateLimit.mockResolvedValueOnce({
      allowed: true,
      retryAfterMs: 0,
      remaining: 8,
    });

    mockedDelivery.deliver.mockResolvedValueOnce({
      success: false,
      statusCode: 500,
      durationMs: 120,
      errorMessage: 'HTTP 500: Internal Server Error',
    });

    const job = createMockJob(1);
    await worker.processJob(job);

    // 1. Persist attempt with RETRYING status
    expect(mockedRepo.recordAttempt).toHaveBeenCalledWith({
      webhookEventId: 'event-uuid-1',
      attemptNumber: 1,
      status: DeliveryStatus.RETRYING,
      responseCode: 500,
      errorMessage: 'HTTP 500: Internal Server Error',
      durationMs: 120,
    });

    // 2. Schedule retry with 2000ms delay (2s backoff)
    expect(mockedQueue.addJob).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptNumber: 2,
      }),
      {
        delay: 2000,
      }
    );
  });

  it('REQ-10: should NOT retry permanent HTTP 400 Bad Request, log FAILED and mark status FAILED', async () => {
    mockedRepo.findById.mockResolvedValueOnce({
      id: 'event-uuid-1',
      eventId: 'evt_test_100',
      destinationUrl: 'https://client.site/webhook',
      destinationDomain: 'client.site',
      payload: {},
      status: WebhookStatus.QUEUED,
      jobId: 'bullmq-job-1',
      attemptCount: 0,
      lastResponseCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockedRateLimiter.checkDomainRateLimit.mockResolvedValueOnce({
      allowed: true,
      retryAfterMs: 0,
      remaining: 9,
    });

    mockedDelivery.deliver.mockResolvedValueOnce({
      success: false,
      statusCode: 400,
      durationMs: 35,
      errorMessage: 'HTTP 400: Bad Request',
    });

    const job = createMockJob(1);
    await worker.processJob(job);

    // 1. Record attempt as FAILED
    expect(mockedRepo.recordAttempt).toHaveBeenCalledWith({
      webhookEventId: 'event-uuid-1',
      attemptNumber: 1,
      status: DeliveryStatus.FAILED,
      responseCode: 400,
      errorMessage: 'HTTP 400: Bad Request',
      durationMs: 35,
    });

    // 2. Event status marked FAILED
    expect(mockedRepo.updateStatus).toHaveBeenCalledWith('event-uuid-1', {
      status: WebhookStatus.FAILED,
      attemptCount: 1,
      lastResponseCode: 400,
    });

    // 3. No retry scheduled
    expect(mockedQueue.addJob).not.toHaveBeenCalled();
  });

  it('REQ-08: should exhaust retries on attempt 4 and mark event FAILED', async () => {
    mockedRepo.findById.mockResolvedValueOnce({
      id: 'event-uuid-1',
      eventId: 'evt_test_100',
      destinationUrl: 'https://client.site/webhook',
      destinationDomain: 'client.site',
      payload: {},
      status: WebhookStatus.QUEUED,
      jobId: 'bullmq-job-1',
      attemptCount: 3,
      lastResponseCode: 500,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockedRateLimiter.checkDomainRateLimit.mockResolvedValueOnce({
      allowed: true,
      retryAfterMs: 0,
      remaining: 9,
    });

    mockedDelivery.deliver.mockResolvedValueOnce({
      success: false,
      statusCode: 500,
      durationMs: 90,
      errorMessage: 'HTTP 500: Server Error',
    });

    // Attempt 4 is the final attempt (initial + 3 retries = 4)
    const job = createMockJob(4);
    await worker.processJob(job);

    expect(mockedRepo.recordAttempt).toHaveBeenCalledWith({
      webhookEventId: 'event-uuid-1',
      attemptNumber: 4,
      status: DeliveryStatus.FAILED,
      responseCode: 500,
      errorMessage: 'HTTP 500: Server Error',
      durationMs: 90,
    });

    expect(mockedRepo.updateStatus).toHaveBeenCalledWith('event-uuid-1', {
      status: WebhookStatus.FAILED,
      attemptCount: 4,
      lastResponseCode: 500,
    });

    expect(mockedQueue.addJob).not.toHaveBeenCalled();
  });

  it('REQ-12 & REQ-13: should defer job when domain rate limit is exhausted without recording a failed attempt', async () => {
    mockedRepo.findById.mockResolvedValueOnce({
      id: 'event-uuid-1',
      eventId: 'evt_test_100',
      destinationUrl: 'https://client.site/webhook',
      destinationDomain: 'client.site',
      payload: {},
      status: WebhookStatus.QUEUED,
      jobId: 'bullmq-job-1',
      attemptCount: 0,
      lastResponseCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockedRateLimiter.checkDomainRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 450,
      remaining: 0,
    });

    const job = createMockJob(1);
    await worker.processJob(job);

    // 1. Re-enqueues job with delay = retryAfterMs
    expect(mockedQueue.addJob).toHaveBeenCalledWith(job.data, {
      delay: 450,
    });

    // 2. Crucial: Must NOT call delivery, must NOT record a failed attempt in DB!
    expect(mockedDelivery.deliver).not.toHaveBeenCalled();
    expect(mockedRepo.recordAttempt).not.toHaveBeenCalled();
  });

  it('REQ-03: should skip delivery if event is already marked DELIVERED', async () => {
    mockedRepo.findById.mockResolvedValueOnce({
      id: 'event-uuid-1',
      eventId: 'evt_test_100',
      destinationUrl: 'https://client.site/webhook',
      destinationDomain: 'client.site',
      payload: {},
      status: WebhookStatus.DELIVERED,
      jobId: 'bullmq-job-1',
      attemptCount: 1,
      lastResponseCode: 200,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const job = createMockJob(1);
    await worker.processJob(job);

    expect(mockedDelivery.deliver).not.toHaveBeenCalled();
    expect(mockedRepo.recordAttempt).not.toHaveBeenCalled();
  });
});

