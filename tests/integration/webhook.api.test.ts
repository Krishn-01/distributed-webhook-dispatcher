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
      expect(responseTime).toBeLessThan(200);
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
});
