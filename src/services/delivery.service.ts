import http from 'http';
import https from 'https';
import net from 'net';
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
  pinnedIp?: string;
}

/**
 * DeliveryService handles outbound HTTP webhook deliveries.
 *
 * Delivery Semantics: AT-LEAST-ONCE DELIVERY.
 * Network partitions, server timeouts, or worker restarts may cause a webhook
 * to be delivered more than once. Receivers should implement idempotency using
 * the X-Event-Id header.
 */
export class DeliveryService {
  private timeoutMs: number;
  private ssrfProtection: boolean;

  constructor(options?: { timeoutMs?: number; ssrfProtection?: boolean }) {
    this.timeoutMs = options?.timeoutMs ?? env.DELIVERY_TIMEOUT_MS;
    this.ssrfProtection = options?.ssrfProtection ?? env.ENABLE_SSRF_PROTECTION;
  }

  /**
   * Dispatches a webhook payload to the destinationUrl.
   * Performs SSRF validation, pins the resolved IP to prevent DNS rebinding,
   * attaches standard delivery headers, and measures delivery latency.
   */
  async deliver(
    destinationUrl: string,
    payload: Record<string, unknown>,
    eventId: string,
    attemptNumber: number
  ): Promise<DeliveryResult> {
    const startTime = Date.now();

    try {
      // 1. SSRF & DNS Validation + IP Pinning
      const validated = await validateDestinationUrl(destinationUrl, this.ssrfProtection);

      // 2. Create custom HTTP/HTTPS agents with pinned DNS lookup to prevent TOCTOU DNS rebinding.
      // Supports both standard lookup (opts.all = false) and Node 20/22 autoSelectFamily (opts.all = true)
      // to prevent ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined
      const pinnedLookup = (
        hostname: string,
        options: unknown,
        callback?: (err: Error | null, address?: any, family?: number) => void
      ) => {
        let cb: (err: Error | null, address?: any, family?: number) => void;
        let opts: { all?: boolean; family?: number } = {};

        if (typeof options === 'function') {
          cb = options as any;
        } else {
          cb = callback as any;
          if (typeof options === 'object' && options !== null) {
            opts = options as { all?: boolean; family?: number };
          } else if (typeof options === 'number') {
            opts = { family: options };
          }
        }

        if (typeof cb !== 'function') {
          return;
        }

        const ip = validated.ip;
        const ipFamily = net.isIP(ip);

        // Explicit validation: never pass undefined or invalid IP addresses to HTTP agents
        if (ipFamily === 0) {
          cb(new Error(`Invalid or unresolvable IP address "${ip}" for host "${hostname}"`));
          return;
        }

        // Handle standard vs all: true lookup callbacks for Node.js 20/22
        if (opts.all) {
          cb(null, [{ address: ip, family: ipFamily }]);
        } else {
          cb(null, ip, ipFamily);
        }
      };

      const httpAgent = new http.Agent({
        keepAlive: false,
        lookup: pinnedLookup,
      });

      const httpsAgent = new https.Agent({
        keepAlive: false,
        lookup: pinnedLookup,
      });

      // 3. Outbound HTTP POST with standard delivery headers
      const response: AxiosResponse = await axios.post(destinationUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Distributed-Webhook-Dispatcher/1.0',
          'X-Event-Id': eventId,
          'X-Delivery-Attempt': attemptNumber.toString(),
          'X-Webhook-Event-Id': eventId,
          'X-Webhook-Attempt': attemptNumber.toString(),
          'X-Webhook-Timestamp': new Date().toISOString(),
        },
        timeout: this.timeoutMs,
        maxRedirects: 0, // Security: Prevent open redirect SSRF bypass
        httpAgent,
        httpsAgent,
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
          pinnedIp: validated.ip,
        },
        'Webhook delivered successfully'
      );

      return {
        success: true,
        statusCode: response.status,
        durationMs,
        errorMessage: null,
        pinnedIp: validated.ip,
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
