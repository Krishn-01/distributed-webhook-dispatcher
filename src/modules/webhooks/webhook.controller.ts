import { Request, Response, NextFunction } from 'express';
import { webhookService, WebhookService } from './webhook.service';
import { dispatchWebhookSchema, webhookJobIdParamSchema } from './webhook.schema';

export class WebhookController {
  private service: WebhookService;

  constructor(service = webhookService) {
    this.service = service;
  }

  /**
   * POST /api/webhooks/dispatch
   * Ingests a webhook event, queues it, and responds immediately with 202 Accepted.
   */
  dispatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = dispatchWebhookSchema.parse(req.body);
      const result = await this.service.dispatch(validated);

      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/webhooks/:jobId
   * Retrieves current status and execution metadata of a webhook job.
   */
  getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobId } = webhookJobIdParamSchema.parse(req.params);
      const details = await this.service.getStatusByJobId(jobId);

      res.status(200).json({
        jobId: details.jobId,
        eventId: details.eventId,
        destinationDomain: details.destinationDomain,
        status: details.status,
        attemptCount: details.attemptCount,
        lastResponseCode: details.lastResponseCode,
        createdAt: details.createdAt,
        updatedAt: details.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/webhooks/:jobId/attempts
   * Retrieves chronological delivery attempt history for a webhook job.
   */
  getAttempts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobId } = webhookJobIdParamSchema.parse(req.params);
      const attempts = await this.service.getAttemptsByJobId(jobId);

      res.status(200).json({
        jobId,
        attempts: attempts.map((a) => ({
          attemptNumber: a.attemptNumber,
          status: a.status,
          responseCode: a.responseCode,
          errorMessage: a.errorMessage,
          durationMs: a.durationMs,
          createdAt: a.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  };
}

export const webhookController = new WebhookController();

