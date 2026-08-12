import { PrismaClient } from '@prisma/client';
import { logger } from '@rabst24/config';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' }
  ]
});

let runtimeConfigured = false;

export async function configurePrismaRuntime(): Promise<void> {
  if (runtimeConfigured) {
    return;
  }

  runtimeConfigured = true;

  try {
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 30000');
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL');
    logger.info('SQLite runtime pragmas configured');
  } catch (error) {
    runtimeConfigured = false;
    logger.warn({ err: error }, 'SQLite runtime pragma configuration failed');
  }
}

prisma.$on('error', (event) => {
  logger.error({ target: event.target, message: event.message }, 'Prisma error');
});

prisma.$on('warn', (event) => {
  logger.warn({ target: event.target, message: event.message }, 'Prisma warning');
});
