import axios, { AxiosError, AxiosResponse } from 'axios';
import { env } from '../config/env';
import { validateDestinationUrl } from '../utils/ssrf';
import { logger } from '../utils/logger';

export interface DeliveryResult {
  success: boolean;
  statusCode: number | null;
  durationMs: number;
  errorMessage: string | null;
  retryAfterHeader?: string;
}

export class DeliveryService {
  private timeoutMs: number;
  private ssrfProtection: boolean;

  constructor(options?: { timeoutMs?: number; ssrfProtection?: boolean }) {
    this.timeoutMs = options?.timeoutMs ?? env.DELIVERY_TIMEOUT_MS;
    this.ssrfProtection = options?.ssrfProtection ?? env.ENABLE_SSRF_PROTECTION;
  }

  /**
   * Dispatches a webhook payload to the destinationUrl.
   */
  async deliver(
    destinationUrl: string,
    payload: Record<string, unknown>,
    eventId: string,
    attemptNumber: number
  ): Promise<DeliveryResult> {
    const startTime = Date.now();

    try {
      // 1. SSRF & DNS Validation
      await validateDestinationUrl(destinationUrl, this.ssrfProtection);

      // 2. Outbound HTTP POST
      const response: AxiosResponse = await axios.post(destinationUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Distributed-Webhook-Dispatcher/1.0',
          'X-Webhook-Event-Id': eventId,
          'X-Webhook-Attempt': attemptNumber.toString(),
          'X-Webhook-Timestamp': new Date().toISOString(),
        },
        timeout: this.timeoutMs,
        maxRedirects: 0, // Security: Prevent open redirect SSRF bypass
        validateStatus: (status) => status >= 200 && status < 300, // Only 2xx is considered success
      });

      const durationMs = Date.now() - startTime;

      logger.info(
        {
          eventId,
          destinationUrl,
          attemptNumber,
          statusCode: response.status,
          durationMs,
        },
        'Webhook delivered successfully'
      );

      return {
        success: true,
        statusCode: response.status,
        durationMs,
        errorMessage: null,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const axiosErr = err as AxiosError;

      let statusCode: number | null = null;
      let errorMessage = (err as Error).message;
      let retryAfterHeader: string | undefined;

      if (axiosErr.response) {
        statusCode = axiosErr.response.status;
        errorMessage = `HTTP ${statusCode}: ${axiosErr.response.statusText || 'Response error'}`;
        const rawRetryAfter = axiosErr.response.headers?.['retry-after'];
        if (typeof rawRetryAfter === 'string') {
          retryAfterHeader = rawRetryAfter;
        }
      } else if (axiosErr.code === 'ECONNABORTED' || errorMessage.includes('timeout')) {
        errorMessage = `Request timed out after ${this.timeoutMs}ms`;
      } else if (axiosErr.code) {
        errorMessage = `Network error (${axiosErr.code}): ${axiosErr.message}`;
      }

      logger.warn(
        {
          eventId,
          destinationUrl,
          attemptNumber,
          statusCode,
          durationMs,
          errorMessage,
        },
        'Webhook delivery attempt failed'
      );

      return {
        success: false,
        statusCode,
        durationMs,
        errorMessage,
        retryAfterHeader,
      };
    }
  }
}

export const deliveryService = new DeliveryService();
