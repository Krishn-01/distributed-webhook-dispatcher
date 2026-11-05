import axios from 'axios';
import { DeliveryService } from '../../src/services/delivery.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DeliveryService', () => {
  let deliveryService: DeliveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    deliveryService = new DeliveryService({ timeoutMs: 5000, ssrfProtection: false });
  });

  it('should deliver webhook payload successfully with 2xx status and standard headers', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      data: { received: true },
      headers: {},
    });

    const result = await deliveryService.deliver(
      'https://example.com/webhook',
      { foo: 'bar' },
      'evt_test_1',
      1
    );

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.errorMessage).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://example.com/webhook',
      { foo: 'bar' },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'User-Agent': 'Distributed-Webhook-Dispatcher/1.0',
          'X-Event-Id': 'evt_test_1',
          'X-Delivery-Attempt': '1',
          'X-Webhook-Event-Id': 'evt_test_1',
          'X-Webhook-Attempt': '1',
        }),
        httpAgent: expect.any(Object),
        httpsAgent: expect.any(Object),
      })
    );
  });

  it('should handle HTTP 500 response error', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
      },
      message: 'Request failed with status code 500',
    });

    const result = await deliveryService.deliver(
      'https://example.com/webhook',
      { foo: 'bar' },
      'evt_test_2',
      1
    );

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.errorMessage).toContain('HTTP 500');
  });

  it('should capture Retry-After header on HTTP 429 response', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          'retry-after': '5',
        },
      },
      message: 'Request failed with status code 429',
    });

    const result = await deliveryService.deliver(
      'https://example.com/webhook',
      { foo: 'bar' },
      'evt_test_3',
      1
    );

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(429);
    expect(result.retryAfterHeader).toBe('5');
  });

  it('should handle request timeout', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      code: 'ECONNABORTED',
      message: 'timeout of 5000ms exceeded',
    });

    const result = await deliveryService.deliver(
      'https://example.com/webhook',
      { foo: 'bar' },
      'evt_test_4',
      1
    );

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('timed out');
  });

  it('should handle network connection failure', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED 127.0.0.1:80',
    });

    const result = await deliveryService.deliver(
      'https://example.com/webhook',
      { foo: 'bar' },
      'evt_test_5',
      1
    );

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('ECONNREFUSED');
  });
});
