import { Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Distributed Webhook Dispatcher Engine API',
    version: '1.0.0',
    description:
      'High-throughput asynchronous distributed webhook dispatcher with BullMQ, Redis sliding-window per-domain rate limiting, exponential backoff, and PostgreSQL attempt tracking.',
  },
  servers: [
    {
      url: '/',
      description: 'Current Environment Server',
    },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'System health check',
        description: 'Verifies the health and connectivity of the API, PostgreSQL database, and Redis queue cluster.',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'All services healthy and connected',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    timestamp: { type: 'string', format: 'date-time' },
                    services: {
                      type: 'object',
                      properties: {
                        api: { type: 'string', example: 'up' },
                        database: { type: 'string', example: 'connected' },
                        redis: { type: 'string', example: 'connected' },
                      },
                    },
                  },
                },
              },
            },
          },
          '503': {
            description: 'One or more dependencies unavailable',
          },
        },
      },
    },
    '/api/webhooks/dispatch': {
      post: {
        summary: 'Ingest and dispatch a webhook event',
        description:
          'Validates the payload, ensures idempotency on eventId, persists event state to PostgreSQL, enqueues the delivery job to BullMQ, and immediately responds with 202 Accepted.',
        tags: ['Webhooks'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['destinationUrl', 'eventId', 'payload'],
                properties: {
                  destinationUrl: {
                    type: 'string',
                    format: 'uri',
                    example: 'https://webhook.site/test-endpoint',
                    description: 'Destination URL (must use http or https scheme)',
                  },
                  eventId: {
                    type: 'string',
                    example: 'evt_123456',
                    description: 'Unique client-provided event identifier for idempotency',
                  },
                  payload: {
                    type: 'object',
                    example: {
                      event: 'user.signup',
                      userId: 'usr_999',
                    },
                    description: 'JSON object payload delivered to the destination',
                  },
                },
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Webhook event accepted and queued for asynchronous background delivery',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'queued' },
                    jobId: { type: 'string', example: 'job_48f98ec0-...' },
                    eventId: { type: 'string', example: 'evt_123456' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid input or malformed schema validation failure',
          },
        },
      },
    },
    '/api/webhooks/{jobId}': {
      get: {
        summary: 'Get webhook job status and details',
        description: 'Returns the current execution status, destination domain, attempt count, and last response code.',
        tags: ['Webhooks'],
        parameters: [
          {
            name: 'jobId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Job ID or event ID of the webhook',
          },
        ],
        responses: {
          '200': {
            description: 'Webhook details retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    jobId: { type: 'string', example: 'job_48f98ec0-...' },
                    eventId: { type: 'string', example: 'evt_123456' },
                    destinationDomain: { type: 'string', example: 'webhook.site' },
                    status: {
                      type: 'string',
                      enum: ['QUEUED', 'PROCESSING', 'DELIVERED', 'FAILED'],
                      example: 'DELIVERED',
                    },
                    attemptCount: { type: 'integer', example: 1 },
                    lastResponseCode: { type: 'integer', example: 200 },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Webhook job not found',
          },
        },
      },
    },
    '/api/webhooks/{jobId}/attempts': {
      get: {
        summary: 'Get chronological delivery attempt history',
        description: 'Retrieves all HTTP delivery attempts executed by the background worker for this webhook.',
        tags: ['Webhooks'],
        parameters: [
          {
            name: 'jobId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Job ID or event ID of the webhook',
          },
        ],
        responses: {
          '200': {
            description: 'Delivery attempts retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    jobId: { type: 'string', example: 'job_48f98ec0-...' },
                    attempts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          attemptNumber: { type: 'integer', example: 1 },
                          status: {
                            type: 'string',
                            enum: ['SUCCESS', 'FAILED', 'RETRYING'],
                            example: 'RETRYING',
                          },
                          responseCode: { type: 'integer', example: 500 },
                          errorMessage: { type: 'string', example: 'HTTP 500: Internal Server Error' },
                          durationMs: { type: 'integer', example: 124 },
                          createdAt: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Webhook job not found',
          },
        },
      },
    },
  },
};

export const swaggerUiServe = swaggerUi.serve;
export const swaggerUiSetup = swaggerUi.setup(openApiDocument);

export function swaggerJsonHandler(_req: Request, res: Response): void {
  res.setHeader('Content-Type', 'application/json');
  res.send(openApiDocument);
}
