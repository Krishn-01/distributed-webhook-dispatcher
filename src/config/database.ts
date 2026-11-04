import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  global.prismaGlobal ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

// Attach logging
// @ts-expect-error prisma event typing
prisma.$on('error', (e: { message: string }) => {
  logger.error({ error: e.message }, 'Prisma database error');
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
