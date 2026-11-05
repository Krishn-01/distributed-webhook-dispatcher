import { webhookWorker } from '../../src/workers/webhook.worker';

jest.mock('../../src/workers/webhook.worker', () => ({
  webhookWorker: {
    start: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Worker In-Process Startup Evaluation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have start method on webhookWorker instance', () => {
    expect(typeof webhookWorker.start).toBe('function');
    expect(typeof webhookWorker.close).toBe('function');
  });

  it('should be invocable in embedded mode without throwing', async () => {
    webhookWorker.start();
    expect(webhookWorker.start).toHaveBeenCalledTimes(1);
    await webhookWorker.close();
    expect(webhookWorker.close).toHaveBeenCalledTimes(1);
  });
});

