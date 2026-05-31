import { config, logger } from '@rabst24/config';
import { prisma } from '@rabst24/db';
import { createApp } from './create-app.js';
import { createContainer } from './container.js';

export async function bootstrap(): Promise<void> {
  const container = createContainer();
  const app = createApp(container);

  await prisma.$connect();
  logger.info('Database connection established');
  container.autoPublicationService.start();

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const httpServer = app.listen(config.port, () => {
      logger.info({ port: config.port }, 'API server started');
      resolve(httpServer);
    });

    httpServer.once('error', reject);
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');

    server.close(async (error) => {
      if (error) {
        logger.error({ err: error }, 'HTTP server shutdown failed');
        process.exitCode = 1;
      }

      container.autoPublicationService.stop();
      await prisma.$disconnect();
      logger.info('API server stopped');
      process.exit();
    });
  };

  process.on('SIGINT', (signal) => {
    void shutdown(signal);
  });

  process.on('SIGTERM', (signal) => {
    void shutdown(signal);
  });
}
