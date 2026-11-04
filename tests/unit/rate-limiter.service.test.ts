import { RateLimiterService } from '../../src/services/rate-limiter.service';
import Redis from 'ioredis';

describe('RateLimiterService', () => {
  let mockRedisClient: jest.Mocked<Redis>;
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    mockRedisClient = {
      eval: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
    } as unknown as jest.Mocked<Redis>;

    rateLimiter = new RateLimiterService({
      redisClient: mockRedisClient,
      maxRequests: 5,
      windowMs: 1000,
    });
  });

  it('should allow request when within rate limit', async () => {
    // Lua returns: [allowed (1), retryAfter (0), remaining (4)]
    mockRedisClient.eval.mockResolvedValueOnce([1, 0, 4]);

    const result = await rateLimiter.checkDomainRateLimit('api.target.com');

    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
    expect(result.remaining).toBe(4);
    expect(mockRedisClient.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'ratelimit:domain:api.target.com',
      expect.any(String),
      '1000',
      '5',
      expect.any(String)
    );
  });

  it('should deny request and return retryAfterMs when rate limit is exceeded', async () => {
    // Lua returns: [disallowed (0), retryAfter (350), remaining (0)]
    mockRedisClient.eval.mockResolvedValueOnce([0, 350, 0]);

    const result = await rateLimiter.checkDomainRateLimit('api.target.com');

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(350);
    expect(result.remaining).toBe(0);
  });

  it('should gracefully allow request if Redis Lua script throws an error', async () => {
    mockRedisClient.eval.mockRejectedValueOnce(new Error('Redis connection drop'));

    const result = await rateLimiter.checkDomainRateLimit('api.target.com');

    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });
});

