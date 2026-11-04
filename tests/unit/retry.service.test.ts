import { RetryService } from '../../src/services/retry.service';
import { SecurityError } from '../../src/utils/app-error';

describe('RetryService & Exponential Backoff', () => {
  let retryService: RetryService;

  beforeEach(() => {
    retryService = new RetryService(3); // 3 retries max
  });

  describe('calculateDelay', () => {
    it('should calculate 2s (2000ms) delay for attempt 1 failure (Retry 1)', () => {
      const delay = retryService.calculateDelay(1);
      expect(delay).toBe(2000);
    });

    it('should calculate 4s (4000ms) delay for attempt 2 failure (Retry 2)', () => {
      const delay = retryService.calculateDelay(2);
      expect(delay).toBe(4000);
    });

    it('should calculate 8s (8000ms) delay for attempt 3 failure (Retry 3)', () => {
      const delay = retryService.calculateDelay(3);
      expect(delay).toBe(8000);
    });

    it('should respect numeric Retry-After header bounded up to 30s', () => {
      // 10 seconds requested
      expect(retryService.calculateDelay(1, '10')).toBe(10000);

      // Higher than 30s should be capped at 30,000ms
      expect(retryService.calculateDelay(1, '60')).toBe(30000);

      // Smaller than standard backoff should not decrease below standard exponential backoff
      expect(retryService.calculateDelay(2, '1')).toBe(4000);
    });
  });

  describe('evaluateRetry', () => {
    it('should retry HTTP 500 with exponential backoff', () => {
      const result = retryService.evaluateRetry(1, 500);
      expect(result.shouldRetry).toBe(true);
      expect(result.delayMs).toBe(2000);
    });

    it('should retry HTTP 502, 503, 504 server errors', () => {
      expect(retryService.evaluateRetry(1, 502).shouldRetry).toBe(true);
      expect(retryService.evaluateRetry(2, 503).delayMs).toBe(4000);
      expect(retryService.evaluateRetry(3, 504).delayMs).toBe(8000);
    });

    it('should retry HTTP 429 Too Many Requests', () => {
      const result = retryService.evaluateRetry(1, 429);
      expect(result.shouldRetry).toBe(true);
      expect(result.delayMs).toBe(2000);
    });

    it('should retry network errors and timeouts', () => {
      const timeoutError = new Error('Request timed out after 10000ms');
      const networkError = Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });

      expect(retryService.evaluateRetry(1, null, timeoutError).shouldRetry).toBe(true);
      expect(retryService.evaluateRetry(2, null, networkError).delayMs).toBe(4000);
    });

    it('should NOT retry permanent HTTP 400 Bad Request', () => {
      const result = retryService.evaluateRetry(1, 400);
      expect(result.shouldRetry).toBe(false);
      expect(result.delayMs).toBe(0);
      expect(result.reason).toContain('Permanent failure: HTTP 400');
    });

    it('should NOT retry permanent HTTP 401, 403, 404 client errors', () => {
      expect(retryService.evaluateRetry(1, 401).shouldRetry).toBe(false);
      expect(retryService.evaluateRetry(1, 403).shouldRetry).toBe(false);
      expect(retryService.evaluateRetry(1, 404).shouldRetry).toBe(false);
    });

    it('should NOT retry SSRF Security violations', () => {
      const secErr = new SecurityError('Access to private IP is forbidden');
      const result = retryService.evaluateRetry(1, null, secErr);
      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toContain('SSRF security restriction violated');
    });

    it('should exhaust retries on attempt 4 (initial + 3 retries)', () => {
      // Attempt 4 has already reached total maximum attempts (4)
      const result = retryService.evaluateRetry(4, 500);
      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toContain('Exhausted maximum attempts');
    });
  });
});
