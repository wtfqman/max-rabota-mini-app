import { config, logger } from '@rabst24/config';
import { prisma } from '@rabst24/db';
import { createApp } from './create-app.js';
import { createContainer } from './container.js';

export async function bootstrap(): Promise<void> {
  const container = createContainer();
  const app = createApp(container);

  await prisma.$connect();
  logger.info('Database connection established');
  logger.info('Auto publication service is disabled');
  if (config.features.TELEGRAM_SYNC_ENABLED) {
    const result = await container.telegramSyncService.ensureTargets();
    logger.info(result, 'Telegram targets registry ensured');
  }
  container.outboxWorker.start();

  const paymentReconcileTimer = setInterval(() => {
    void container.adPaymentService.reconcileRecentPendingPayments().catch((error) => {
      logger.warn({ err: error }, 'Pending YooKassa payment reconciliation failed');
    });
  }, 30_000);
  paymentReconcileTimer.unref();

  void container.adPaymentService.reconcileRecentPendingPayments().catch((error) => {
    logger.warn({ err: error }, 'Initial pending YooKassa payment reconciliation failed');
  });

  const enqueueSavedSearchDigest = (): void => {
    if (!config.features.SAVED_SEARCHES_ENABLED) {
      return;
    }

    const digestDate = formatLocalDate(addDays(new Date(), -1));
    void container.savedSearchesService.enqueueDailyDigest(digestDate).catch((error) => {
      logger.warn({ err: error, digestDate }, 'Saved search daily digest enqueue failed');
    });
  };
  const savedSearchDigestTimer = setInterval(enqueueSavedSearchDigest, 60 * 60 * 1000);
  savedSearchDigestTimer.unref();
  enqueueSavedSearchDigest();

  const runPromotionMaintenance = (): void => {
    if (!config.features.PROMOTIONS_ENABLED) {
      return;
    }

    const maintenanceHour = formatLocalHour(new Date());
    void container.outboxService.enqueue({
      type: 'PROMOTION_BUMP',
      payload: {
        maintenanceHour
      },
      idempotencyKey: `promotion-maintenance:${maintenanceHour}`,
      maxAttempts: 5
    }).catch((error) => {
      logger.warn({ err: error, maintenanceHour }, 'Promotion maintenance enqueue failed');
    });
  };
  const promotionMaintenanceTimer = setInterval(runPromotionMaintenance, 60 * 60 * 1000);
  promotionMaintenanceTimer.unref();
  runPromotionMaintenance();

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const httpServer = app.listen(config.port, () => {
      logger.info({ port: config.port }, 'API server started');
      resolve(httpServer);
    });

    httpServer.once('error', reject);
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(paymentReconcileTimer);
    clearInterval(savedSearchDigestTimer);
    clearInterval(promotionMaintenanceTimer);
    container.outboxWorker.stop();

    server.close(async (error) => {
      if (error) {
        logger.error({ err: error }, 'HTTP server shutdown failed');
        process.exitCode = 1;
      }

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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalHour(date: Date): string {
  return `${formatLocalDate(date)}T${String(date.getHours()).padStart(2, '0')}`;
}
