import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/webhook_dispatcher?schema=public'),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  DELIVERY_TIMEOUT_MS: z.coerce.number().default(10000),
  MAX_RETRIES: z.coerce.number().default(3),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(1000),
  ENABLE_SSRF_PROTECTION: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default('true'),
  ALLOW_PRIVATE_HOSTS: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default('false'),
  SELF_BASE_URL: z.string().optional(),
  RUN_WORKER_IN_PROCESS: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default(isProd ? 'true' : 'false'),
  CORS_ORIGIN: z.string().default('*'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables configuration:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
