import {
  AdRepository,
  AdService,
  ChannelPostFormatter,
  ChannelPublishLogRepository,
  ChannelPublishingService,
  FavoriteRepository,
  ModerationLogRepository,
  ModerationService,
  ReviewRepository,
  UserRepository,
  UserService
} from '@rabst24/core';
import { config } from '@rabst24/config';
import { prisma } from '@rabst24/db';
import { MaxApiClient } from '@rabst24/max-api';
import { BotUpdateRouter, StartHandler } from '@rabst24/bot-core';
import {
  ExternalPublicationRepository,
  TelegramAccountRepository,
  TelegramApiClient,
  TelegramLinkingService,
  TelegramLinkTokenRepository,
  TelegramPublicationService,
  TelegramTargetRepository
} from '@rabst24/telegram';
import { AutoPublicationService } from '../modules/ads/auto-publication.service.js';
import { AdRevisionRepository } from '../modules/ads/ad-revision.repository.js';
import { AdAnalyticsService } from '../modules/ad-analytics/ad-analytics.service.js';
import { JobApplicationsService } from '../modules/applications/applications.service.js';
import { ModerationNotificationService } from '../modules/moderation/moderation-notification.service.js';
import { NotificationService } from '../modules/notifications/notifications.service.js';
import { OutboxRepository } from '../modules/outbox/outbox.repository.js';
import { OutboxService } from '../modules/outbox/outbox.service.js';
import { OutboxWorker } from '../modules/outbox/outbox.worker.js';
import { AdPaymentService } from '../modules/payments/ad-payment.service.js';
import { YooKassaClient } from '../modules/payments/yookassa-client.js';
import { PromotionsService } from '../modules/promotions/promotions.service.js';
import { SavedSearchesService } from '../modules/saved-searches/saved-searches.service.js';
import { TelegramSyncService } from '../modules/telegram-sync/telegram-sync.service.js';
import { VerifiedContactsService } from '../modules/verified-contacts/verified-contacts.service.js';

export function createContainer() {
  const maxApiClient = new MaxApiClient({
    baseUrl: config.max.apiBaseUrl,
    token: config.max.botToken
  });
  const telegramApiClient = new TelegramApiClient({
    token: config.telegram.botToken ?? 'telegram-bot-token-not-configured',
    baseUrl: config.telegram.apiBaseUrl
  });
  const yooKassaClient = new YooKassaClient({
    shopId: config.yookassa.shopId,
    secretKey: config.yookassa.secretKey,
    apiBaseUrl: config.yookassa.apiBaseUrl
  });

  const userRepository = new UserRepository(prisma);
  const adRepository = new AdRepository(prisma);
  const moderationLogRepository = new ModerationLogRepository(prisma);
  const channelPublishLogRepository = new ChannelPublishLogRepository(prisma);
  const telegramTargetRepository = new TelegramTargetRepository(prisma);
  const externalPublicationRepository = new ExternalPublicationRepository(prisma);
  const telegramAccountRepository = new TelegramAccountRepository(prisma);
  const telegramLinkTokenRepository = new TelegramLinkTokenRepository(prisma);
  const outboxRepository = new OutboxRepository(prisma);
  const adRevisionRepository = new AdRevisionRepository(prisma);
  const favoriteRepository = new FavoriteRepository(prisma);
  const reviewRepository = new ReviewRepository(prisma);
  const outboxService = new OutboxService(outboxRepository, {
    lockTimeoutMs: config.outbox.workerLockTimeoutMs
  });
  const notificationService = new NotificationService(prisma, outboxService, maxApiClient, {
    miniAppUrl: config.miniAppUrl,
    miniAppWebApp: config.max.miniAppWebApp
  });
  const verifiedContactsService = new VerifiedContactsService(
    prisma,
    maxApiClient,
    notificationService,
    {
      botToken: config.max.botToken,
      verificationTtlDays: config.contacts.verificationTtlDays,
      authDataMaxAgeSeconds: config.max.initDataMaxAgeSeconds,
      reverifyDeadlineHours: config.contacts.reverifyDeadlineHours,
      consentDocumentVersion: config.contacts.consentDocumentVersion,
      miniAppUrl: config.miniAppUrl,
      miniAppWebApp: config.max.miniAppWebApp,
      verifiedPhoneUnlockEnabled: config.features.VERIFIED_PHONE_UNLOCK_ENABLED
    }
  );
  const adAnalyticsService = new AdAnalyticsService(prisma);
  const moderationNotificationService = new ModerationNotificationService(prisma);
  moderationNotificationService.setNotificationService(notificationService);
  const jobApplicationsService = new JobApplicationsService(prisma, notificationService, adAnalyticsService);
  const savedSearchesService = new SavedSearchesService(prisma, adRepository, outboxService, notificationService);
  const promotionsService = new PromotionsService(
    prisma,
    yooKassaClient,
    {
      enabled: config.yookassa.enabled,
      currency: 'RUB',
      returnUrl: config.yookassa.returnUrl,
      testMode: config.yookassa.testMode
    },
    notificationService
  );
  const adPaymentService = new AdPaymentService(
    prisma,
    yooKassaClient,
    {
      enabled: config.yookassa.enabled,
      amountValue: config.yookassa.adPlacementAmountRub,
      currency: 'RUB',
      returnUrl: config.yookassa.returnUrl,
      testMode: config.yookassa.testMode
    },
    moderationNotificationService,
    adRevisionRepository,
    notificationService,
    adAnalyticsService
  );

  const adService = new AdService(adRepository);
  const moderationService = new ModerationService(adRepository, moderationLogRepository);
  const channelPostFormatter = new ChannelPostFormatter({
    miniAppUrl: config.miniAppUrl,
    miniAppWebApp: config.max.miniAppWebApp
  });
  const channelPublishingService = new ChannelPublishingService(
    maxApiClient,
    channelPublishLogRepository,
    channelPostFormatter,
    adRepository,
    config.miniAppUrl
  );
  const telegramPublicationService = new TelegramPublicationService(
    telegramApiClient,
    telegramTargetRepository,
    externalPublicationRepository,
    {
      miniAppUrl: config.miniAppUrl,
      publicBaseUrl: config.miniAppUrl,
      testMode: config.features.TELEGRAM_TEST_MODE
    }
  );
  const telegramLinkingService = new TelegramLinkingService(
    telegramAccountRepository,
    telegramLinkTokenRepository,
    {
      ttlMinutes: 15,
      hashPepper: config.session.secret
    }
  );
  const userService = new UserService(userRepository);
  const telegramSyncService = new TelegramSyncService(
    prisma,
    adRepository,
    outboxService,
    telegramPublicationService,
    telegramLinkingService
  );
  const autoPublicationService = new AutoPublicationService(
    prisma,
    adService,
    channelPublishingService,
    adPaymentService
  );
  const outboxWorker = new OutboxWorker(outboxService, {
    enabled: config.outbox.workerEnabled,
    intervalMs: config.outbox.workerIntervalMs,
    handlers: {
      NOOP: async () => ({
        ok: true
      }),
      MAX_NOTIFICATION: async (job) => notificationService.handleMaxNotificationJob(job.payload),
      TELEGRAM_PUBLICATION: async (job) => telegramSyncService.handlePublicationJob(job.payload as never),
      SAVED_SEARCH_SCAN: async (job) => savedSearchesService.handleOutboxJob(job.payload),
      PROMOTION_BUMP: async () => {
        const [expired, bumped] = await Promise.all([
          promotionsService.expireExpiredPromotions(),
          promotionsService.runAutoBumps()
        ]);

        return {
          expired,
          bumped
        };
      }
    }
  });

  const startHandler = new StartHandler(userService, maxApiClient, {
    miniAppUrl: config.miniAppUrl,
    miniAppWebApp: config.max.miniAppWebApp,
    channelUrl: config.channelUrl
  });
  const botUpdateRouter = new BotUpdateRouter(startHandler, verifiedContactsService);

  return {
    db: prisma,
    maxApiClient,
    telegramApiClient,
    yooKassaClient,
    userRepository,
    adRepository,
    moderationLogRepository,
    channelPublishLogRepository,
    telegramTargetRepository,
    externalPublicationRepository,
    telegramAccountRepository,
    telegramLinkTokenRepository,
    outboxRepository,
    adRevisionRepository,
    favoriteRepository,
    reviewRepository,
    moderationNotificationService,
    adAnalyticsService,
    notificationService,
    verifiedContactsService,
    jobApplicationsService,
    savedSearchesService,
    promotionsService,
    adPaymentService,
    userService,
    adService,
    moderationService,
    channelPublishingService,
    telegramPublicationService,
    telegramLinkingService,
    telegramSyncService,
    autoPublicationService,
    outboxService,
    outboxWorker,
    botUpdateRouter
  };
}

export type ApiContainer = ReturnType<typeof createContainer>;
