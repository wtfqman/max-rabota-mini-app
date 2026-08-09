import { config, logger } from '@rabst24/config';
import { prisma } from '@rabst24/db';
import { createTelegramBotContainer } from './container.js';
import { registerProcessErrorHandlers } from './process-handlers.js';
import { sanitizeTelegramError } from './telegram-error-log.js';

export async function bootstrap(): Promise<void> {
  if (!config.features.TELEGRAM_BOT_ENABLED) {
    logger.warn('Telegram bot process is disabled by TELEGRAM_BOT_ENABLED');
    return;
  }

  if (config.telegram.botMode !== 'polling') {
    logger.warn(
      { mode: config.telegram.botMode },
      'Telegram bot process currently supports polling only. Webhook mode must be wired through API before enabling.'
    );
    return;
  }

  const container = createTelegramBotContainer();
  let isShuttingDown = false;

  await prisma.$connect();
  logger.info('Database connection established');

  await container.targetRepository.ensureExpectedTargets();
  await container.runner.start();

  const shutdown = async (reason: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info({ reason }, 'Telegram bot shutdown requested');

    try {
      await container.runner.stop();
      await prisma.$disconnect();
      logger.info('Telegram bot process stopped');
      process.exit();
    } catch (error) {
      logger.error({ err: sanitizeTelegramError(error) }, 'Telegram bot shutdown failed');
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
