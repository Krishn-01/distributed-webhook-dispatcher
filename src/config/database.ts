import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

type PrismaClientWithEvents = PrismaClient<
  Prisma.PrismaClientOptions,
  'error' | 'warn'
>;

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClientWithEvents | undefined;
}

export const prisma: PrismaClientWithEvents =
  global.prismaGlobal ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

// Attach logging with full type-safety
prisma.$on('error', (e) => {
  logger.error({ error: e.message }, 'Prisma database error');
});

prisma.$on('warn', (e) => {
  logger.warn({ warning: e.message }, 'Prisma database warning');
});

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Database health check failed');
    return false;
  }
}
