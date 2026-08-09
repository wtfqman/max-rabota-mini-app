import { logger } from '@rabst24/config';
import { sanitizeTelegramError } from './telegram-error-log.js';

export function registerProcessErrorHandlers(shutdown: (reason: string) => Promise<void>): void {
  process.on('uncaughtException', (error) => {
    logger.error({ err: sanitizeTelegramError(error) }, 'Telegram bot uncaught exception');
    void shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (error) => {
    logger.error({ err: sanitizeTelegramError(error) }, 'Telegram bot unhandled rejection');
    void shutdown('unhandledRejection');
  });
}
