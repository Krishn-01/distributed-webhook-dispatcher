import { env } from '../config/env';
import { SecurityError } from '../utils/app-error';

export interface RetryEvaluation {
  shouldRetry: boolean;
  delayMs: number;
  reason: string;
}

export class RetryService {
  private maxRetries: number;

  constructor(maxRetries = env.MAX_RETRIES) {
    this.maxRetries = maxRetries;
  }

  /**
   * Evaluates if a failure is retryable based on HTTP status code or error.
   * Total allowed attempts = initial (1) + maxRetries (3) = 4.
   */
  evaluateRetry(
    attemptNumber: number,
    responseCode?: number | null,
    error?: Error,
    retryAfterHeader?: string | string[]
  ): RetryEvaluation {
    // If we've already reached or exceeded the total maximum attempts (initial + 3 retries = 4)
    const maxTotalAttempts = 1 + this.maxRetries;
    if (attemptNumber >= maxTotalAttempts) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: `Exhausted maximum attempts (${maxTotalAttempts})`,
      };
    }

    // SSRF security violations must NEVER be retried
    if (error instanceof SecurityError) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: 'Permanent failure: SSRF security restriction violated',
      };
    }

    // Check HTTP status code
    if (responseCode !== undefined && responseCode !== null) {
      // HTTP 429 Too Many Requests -> Always retryable
      if (responseCode === 429) {
        const delayMs = this.calculateDelay(attemptNumber, retryAfterHeader);
        return {
          shouldRetry: true,
          delayMs,
          reason: 'Retryable failure: HTTP 429 Rate limited',
        };
      }

      // HTTP 5xx Server Errors -> Retryable
      if (responseCode >= 500 && responseCode <= 599) {
        const delayMs = this.calculateDelay(attemptNumber, retryAfterHeader);
        return {
          shouldRetry: true,
          delayMs,
          reason: `Retryable failure: HTTP ${responseCode} Server error`,
        };
      }

      // HTTP 4xx (Client error, except 429) -> Permanent failure, DO NOT RETRY
      if (responseCode >= 400 && responseCode <= 499) {
        return {
          shouldRetry: false,
          delayMs: 0,
          reason: `Permanent failure: HTTP ${responseCode} Client error`,
        };
      }
    }

    // Network errors, timeouts, connection drops
    if (error) {
      const msg = error.message.toLowerCase();
      const code = (error as { code?: string }).code;

      const isNetworkError =
        code === 'ECONNREFUSED' ||
        code === 'ENOTFOUND' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNRESET' ||
        code === 'EHOSTUNREACH' ||
        code === 'EAI_AGAIN' ||
        msg.includes('timeout') ||
        msg.includes('network');

      if (isNetworkError) {
        const delayMs = this.calculateDelay(attemptNumber);
        return {
          shouldRetry: true,
          delayMs,
          reason: `Retryable failure: Network/timeout error (${code || error.message})`,
        };
      }
    }

    // Default: if no status code and unclassified error, treat as retryable network issue
    const delayMs = this.calculateDelay(attemptNumber);
    return {
      shouldRetry: true,
      delayMs,
      reason: 'Retryable failure: General communication error',
    };
  }

  /**
   * Calculates exponential backoff:
   * attempt 1 failure -> retry 1 (delay 2s: 2000ms)
   * attempt 2 failure -> retry 2 (delay 4s: 4000ms)
   * attempt 3 failure -> retry 3 (delay 8s: 8000ms)
   *
   * Formula: 2000 * (2 ^ (attemptNumber - 1))
   */
  calculateDelay(attemptNumber: number, retryAfterHeader?: string | string[]): number {
    // 1. Calculate standard exponential backoff
    // attempt 1 -> 2000 * 2^0 = 2000ms
    // attempt 2 -> 2000 * 2^1 = 4000ms
    // attempt 3 -> 2000 * 2^2 = 8000ms
    const exponent = Math.max(0, attemptNumber - 1);
    const standardBackoffMs = 2000 * Math.pow(2, exponent);

    // 2. Parse Retry-After header if present
    if (retryAfterHeader) {
      const headerVal = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;
      if (headerVal) {
        const parsedSeconds = parseInt(headerVal, 10);
        if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
          // Bounded retry-after between standard backoff and 30 seconds
          const requestedMs = parsedSeconds * 1000;
          return Math.min(Math.max(standardBackoffMs, requestedMs), 30000);
        }

        // Try HTTP-date parsing
        const dateMs = Date.parse(headerVal);
        if (!isNaN(dateMs)) {
          const diffMs = dateMs - Date.now();
          if (diffMs > 0) {
            return Math.min(Math.max(standardBackoffMs, diffMs), 30000);
          }
        }
      }
    }

    return standardBackoffMs;
  }
}

export const retryService = new RetryService();

