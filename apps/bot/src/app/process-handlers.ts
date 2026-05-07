import { logger } from '@rabst24/config';

export function registerProcessErrorHandlers(shutdown: (reason: string) => Promise<void>): void {
  process.on('unhandledRejection', (reason) => {
    if (reason instanceof Error) {
      logger.error({ err: reason }, 'Unhandled promise rejection in bot process');
    } else {
      logger.error({ reason }, 'Unhandled promise rejection in bot process');
    }

    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception in bot process');
    void shutdown('uncaughtException');
  });
}
