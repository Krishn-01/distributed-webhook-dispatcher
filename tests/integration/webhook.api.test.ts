import request from 'supertest';
import { createApp } from '../../src/app';
import { webhookRepository } from '../../src/modules/webhooks/webhook.repository';
import { webhookQueue } from '../../src/queue/webhook.queue';
import { checkDatabaseConnection } from '../../src/config/database';
import { checkRedisConnection } from '../../src/config/redis';
import { WebhookStatus, DeliveryStatus } from '@prisma/client';

jest.mock('../../src/modules/webhooks/webhook.repository');
jest.mock('../../src/queue/webhook.queue');
jest.mock('../../src/config/database');
jest.mock('../../src/config/redis');

describe('Webhook API Integration Tests', () => {
  const app = createApp();
  const mockedRepo = webhookRepository as jest.Mocked<typeof webhookRepository>;
  const mockedQueue = webhookQueue as jest.Mocked<typeof webhookQueue>;
  const mockedDbCheck = checkDatabaseConnection as jest.MockedFunction<typeof checkDatabaseConnection>;
  const mockedRedisCheck = checkRedisConnection as jest.MockedFunction<typeof checkRedisConnection>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/webhooks/dispatch', () => {
    it('REQ-01 & REQ-02: should accept valid webhook and return 202 Accepted immediately', async () => {
      const mockEvent = {
        id: 'event-uuid-1',
        eventId: 'evt_123456',
        destinationUrl: 'https://webhook.site/test',
        destinationDomain: 'webhook.site',
        payload: { event: 'user.signup', userId: 'usr_999' },
        status: WebhookStatus.QUEUED,
        jobId: null,
        attemptCount: 0,
        lastResponseCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockedRepo.findByEventId.mockResolvedValueOnce(null);
      mockedRepo.createEvent.mockResolvedValueOnce(mockEvent);
      // @ts-expect-error mock Job
      mockedQueue.addJob.mockResolvedValueOnce({ id: 'job_event-uuid-1' });
      mockedRepo.updateJobId.mockResolvedValueOnce({ ...mockEvent, jobId: 'job_event-uuid-1' });

      const startTime = Date.now();
      const response = await request(app)
        .post('/api/webhooks/dispatch')
        .send({
          destinationUrl: 'https://webhook.site/test',
          eventId: 'evt_123456',
          payload: { event: 'user.signup', userId: 'usr_999' },
        });
      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        status: 'queued',
        jobId: 'job_event-uuid-1',
        eventId: 'evt_123456',
      });
      // Non-blocking: Must respond quickly
      expect(responseTime).toBeLessThan(300);
      expect(mockedRepo.createEvent).toHaveBeenCalledTimes(1);
      expect(mockedQueue.addJob).toHaveBeenCalledTimes(1);
    });

    it('REQ-03: should be idempotent and return existing jobId for duplicate eventId without double-queuing', async () => {
      const existingEvent = {
        id: 'event-uuid-1',
        eventId: 'evt_123456',
        destinationUrl: 'https://webhook.site/test',
        destinationDomain: 'webhook.site',
        payload: { event: 'user.signup' },
        status: WebhookStatus.QUEUED,
        jobId: 'job_event-uuid-1',
        attemptCount: 0,
        lastResponseCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockedRepo.findByEventId.mockResolvedValueOnce(existingEvent);

      const response = await request(app)
        .post('/api/webhooks/dispatch')
        .send({
          destinationUrl: 'https://webhook.site/test',
          eventId: 'evt_123456',
          payload: { event: 'user.signup' },
        });

      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        status: 'queued',
        jobId: 'job_event-uuid-1',
        eventId: 'evt_123456',
      });
      // Should not create new DB record or enqueue a second job
      expect(mockedRepo.createEvent).not.toHaveBeenCalled();
      expect(mockedQueue.addJob).not.toHaveBeenCalled();
    });

    it('REQ-03 Conflict: should return 409 Conflict if same eventId has different destinationUrl or payload', async () => {
      const existingEvent = {
        id: 'event-uuid-1',
        eventId: 'evt_conflict_1',
        destinationUrl: 'https://webhook.site/original',
        destinationDomain: 'webhook.site',
        payload: { event: 'user.signup' },
        status: WebhookStatus.QUEUED,
        jobId: 'job_original',
        attemptCount: 0,
        lastResponseCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockedRepo.findByEventId.mockResolvedValueOnce(existingEvent);

      const response = await request(app)
        .post('/api/webhooks/dispatch')
        .send({
          destinationUrl: 'https://webhook.site/different-url',
          eventId: 'evt_conflict_1',
          payload: { event: 'user.signup' },
        });

      expect(response.status).toBe(409);
      expect(response.body.error.message).toContain('already exists with different');
    });

    it('P2002 Concurrency: should catch Prisma P2002 on concurrent insert and return 202 if matching', async () => {
      mockedRepo.findByEventId.mockResolvedValueOnce(null); // First check sees nothing (race condition)

      const p2002Error = new Error('Unique constraint failed on eventId');
      // @ts-expect-error Prisma error code
      p2002Error.code = 'P2002';
      mockedRepo.createEvent.mockRejectedValueOnce(p2002Error);

      const concurrentEvent = {
        id: 'event-uuid-concurrent',
        eventId: 'evt_concurrent_1',
        destinationUrl: 'https://webhook.site/race',
        destinationDomain: 'webhook.site',
        payload: { foo: 'bar' },
        status: WebhookStatus.QUEUED,
        jobId: 'job_concurrent',
        attemptCount: 0,
        lastResponseCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockedRepo.findByEventId.mockResolvedValueOnce(concurrentEvent);

      const response = await request(app)
        .post('/api/webhooks/dispatch')
        .send({
          destinationUrl: 'https://webhook.site/race',
          eventId: 'evt_concurrent_1',
          payload: { foo: 'bar' },
        });

      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        status: 'queued',
        jobId: 'job_concurrent',
        eventId: 'evt_concurrent_1',
      });
    });

    it('Enqueue Failure: should mark event FAILED and return 503 if Redis enqueue throws an error', async () => {
      const mockEvent = {
        id: 'event-uuid-fail',
        eventId: 'evt_enqueue_fail',
        destinationUrl: 'https://webhook.site/test',
        destinationDomain: 'webhook.site',
        payload: { test: true },
        status: WebhookStatus.QUEUED,
        jobId: null,
        attemptCount: 0,
        lastResponseCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockedRepo.findByEventId.mockResolvedValueOnce(null);
      mockedRepo.createEvent.mockResolvedValueOnce(mockEvent);
      mockedQueue.addJob.mockRejectedValueOnce(new Error('Redis connection lost'));

      const response = await request(app)
        .post('/api/webhooks/dispatch')
        .send({
          destinationUrl: 'https://webhook.site/test',
          eventId: 'evt_enqueue_fail',
          payload: { test: true },
        });

      expect(response.status).toBe(503);
      expect(response.body.error.message).toContain('Failed to enqueue webhook delivery job');
      expect(mockedRepo.updateStatus).toHaveBeenCalledWith('event-uuid-fail', {
        status: WebhookStatus.FAILED,
        lastResponseCode: null,
      });
      expect(mockedRepo.recordAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookEventId: 'event-uuid-fail',
          status: DeliveryStatus.FAILED,
          errorMessage: expect.stringContaining('Redis connection lost'),
        })
      );
    });

    it('REQ-04: should reject invalid destinationUrl with HTTP 400', async () => {
      const response = await request(app)
        .post('/api/webhooks/dispatch')
        .send({
          destinationUrl: 'ftp://invalidscheme.com/hook',
          eventId: 'evt_999',
          payload: { foo: 'bar' },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Invalid request payload');
    });

    it('should reject missing eventId with HTTP 400', async () => {
      const response = await request(app)
        .post('/api/webhooks/dispatch')
        .send({
          destinationUrl: 'https://example.com/webhook',
          payload: { foo: 'bar' },
        });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'eventId' }),
        ])
      );
    });

    it('should reject missing payload with HTTP 400', async () => {
      const response = await request(app)
        .post('/api/webhooks/dispatch')
        .send({
          destinationUrl: 'https://example.com/webhook',
          eventId: 'evt_no_payload',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'payload' }),
        ])
      );
    });
  });

  describe('GET /api/webhooks (Recent jobs)', () => {
    it('should return recent webhook events', async () => {
      const mockDate = new Date();
      mockedRepo.listRecent.mockResolvedValueOnce([
        {
          id: 'event-1',
          eventId: 'evt_recent_1',
          destinationUrl: 'https://example.com/hook',
          destinationDomain: 'example.com',
          payload: {},
          status: WebhookStatus.DELIVERED,
          jobId: 'job_1',
          attemptCount: 1,
          lastResponseCode: 200,
          createdAt: mockDate,
          updatedAt: mockDate,
        },
      ]);

      const response = await request(app).get('/api/webhooks');

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0].jobId).toBe('job_1');
    });
  });

  describe('GET /api/webhooks/:jobId', () => {
    it('REQ-14: should return status and metadata for an existing webhook', async () => {
      const mockDate = new Date();
      mockedRepo.findByJobId.mockResolvedValueOnce({
        id: 'event-uuid-1',
        eventId: 'evt_123456',
        destinationUrl: 'https://webhook.site/test',
        destinationDomain: 'webhook.site',
        payload: { event: 'user.signup' },
        status: WebhookStatus.DELIVERED,
        jobId: 'job_123',
        attemptCount: 1,
        lastResponseCode: 200,
        createdAt: mockDate,
        updatedAt: mockDate,
      });

      const response = await request(app).get('/api/webhooks/job_123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        jobId: 'job_123',
        eventId: 'evt_123456',
        destinationDomain: 'webhook.site',
        status: 'DELIVERED',
        attemptCount: 1,
        lastResponseCode: 200,
        createdAt: mockDate.toISOString(),
        updatedAt: mockDate.toISOString(),
      });
    });

    it('should return HTTP 404 for non-existent webhook jobId', async () => {
      mockedRepo.findByJobId.mockResolvedValueOnce(null);

      const response = await request(app).get('/api/webhooks/non_existent_job');

      expect(response.status).toBe(404);
      expect(response.body.error.message).toContain('not found');
    });
  });

  describe('GET /api/webhooks/:jobId/attempts', () => {
    it('REQ-15: should return chronological list of delivery attempts', async () => {
      const mockDate = new Date();
      mockedRepo.findByJobId.mockResolvedValueOnce({
        id: 'event-uuid-1',
        eventId: 'evt_123456',
        destinationUrl: 'https://webhook.site/test',
        destinationDomain: 'webhook.site',
        payload: {},
        status: WebhookStatus.DELIVERED,
        jobId: 'job_123',
        attemptCount: 2,
        lastResponseCode: 200,
        createdAt: mockDate,
        updatedAt: mockDate,
      });

      mockedRepo.getAttemptsByEventId.mockResolvedValueOnce([
        {
          id: 'attempt-1',
          webhookEventId: 'event-uuid-1',
          attemptNumber: 1,
          status: DeliveryStatus.RETRYING,
          responseCode: 500,
          errorMessage: 'HTTP 500: Server Error',
          durationMs: 85,
          createdAt: mockDate,
        },
        {
          id: 'attempt-2',
          webhookEventId: 'event-uuid-1',
          attemptNumber: 2,
          status: DeliveryStatus.SUCCESS,
          responseCode: 200,
          errorMessage: null,
          durationMs: 42,
          createdAt: mockDate,
        },
      ]);

      const response = await request(app).get('/api/webhooks/job_123/attempts');

      expect(response.status).toBe(200);
      expect(response.body.jobId).toBe('job_123');
      expect(response.body.attempts).toHaveLength(2);
      expect(response.body.attempts[0]).toEqual({
        attemptNumber: 1,
        status: 'RETRYING',
        responseCode: 500,
        errorMessage: 'HTTP 500: Server Error',
        durationMs: 85,
        createdAt: mockDate.toISOString(),
      });
      expect(response.body.attempts[1].status).toBe('SUCCESS');
    });
  });

  describe('GET /health', () => {
    it('REQ-16: should return 200 when database and redis are healthy', async () => {
      mockedDbCheck.mockResolvedValueOnce(true);
      mockedRedisCheck.mockResolvedValueOnce(true);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.services).toEqual({
        api: 'up',
        database: 'connected',
        redis: 'connected',
      });
    });

    it('should return 503 degraded when a dependency is down', async () => {
      mockedDbCheck.mockResolvedValueOnce(false);
      mockedRedisCheck.mockResolvedValueOnce(true);

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
      expect(response.body.services.database).toBe('disconnected');
    });
  });

  describe('Mock Receiver Endpoints (/mock)', () => {
    it('GET & POST /mock/ok should return 200', async () => {
      const getRes = await request(app).get('/mock/ok');
      expect(getRes.status).toBe(200);
      expect(getRes.body.ok).toBe(true);

      const postRes = await request(app).post('/mock/ok').send({ test: true });
      expect(postRes.status).toBe(200);
      expect(postRes.body.ok).toBe(true);
    });

    it('GET & POST /mock/fail should return 500', async () => {
      const res = await request(app).post('/mock/fail');
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Simulated downstream receiver');
    });

    it('GET /mock/flaky?key=test should return 500 twice, then 200 on 3rd attempt', async () => {
      const key = `test_key_${Date.now()}`;
      const res1 = await request(app).get(`/mock/flaky?key=${key}`);
      expect(res1.status).toBe(500);

      const res2 = await request(app).get(`/mock/flaky?key=${key}`);
      expect(res2.status).toBe(500);

      const res3 = await request(app).get(`/mock/flaky?key=${key}`);
      expect(res3.status).toBe(200);
      expect(res3.body.attempt).toBe(3);
    });

    it('GET /mock/ratelimit should return 429 with Retry-After: 2 header', async () => {
      const res = await request(app).get('/mock/ratelimit');
      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBe('2');
    });
  });
});
