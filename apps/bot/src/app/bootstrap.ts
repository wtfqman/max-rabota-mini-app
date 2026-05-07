import { config, logger } from '@rabst24/config';
import { prisma } from '@rabst24/db';
import { createBotContainer } from './container.js';
import { registerProcessErrorHandlers } from './process-handlers.js';

export async function bootstrap(): Promise<void> {
  const container = createBotContainer();
  let isShuttingDown = false;

  await prisma.$connect();
  logger.info('Database connection established');

  if (config.max.botMode !== 'long-polling') {
    logger.warn(
      { mode: config.max.botMode },
      'Bot process is intended for long polling. Webhook mode is handled by apps/api.'
    );
    await prisma.$disconnect();
    return;
  }

  container.botRunner.start();

  const shutdown = async (reason: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ reason }, 'Bot shutdown requested');

    try {
      await container.botRunner.stop();
      await prisma.$disconnect();
      logger.info('Bot process stopped');
      process.exit();
    } catch (error) {
      logger.error({ err: error }, 'Bot shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', (signal) => {
    void shutdown(signal);
  });

  process.on('SIGTERM', (signal) => {
    void shutdown(signal);
  });

  registerProcessErrorHandlers(shutdown);
}
