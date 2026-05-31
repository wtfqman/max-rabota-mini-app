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
import { AutoPublicationService } from '../modules/ads/auto-publication.service.js';
import { ModerationNotificationService } from '../modules/moderation/moderation-notification.service.js';

export function createContainer() {
  const maxApiClient = new MaxApiClient({
    baseUrl: config.max.apiBaseUrl,
    token: config.max.botToken
  });

  const userRepository = new UserRepository(prisma);
  const adRepository = new AdRepository(prisma);
  const moderationLogRepository = new ModerationLogRepository(prisma);
  const channelPublishLogRepository = new ChannelPublishLogRepository(prisma);
  const favoriteRepository = new FavoriteRepository(prisma);
  const reviewRepository = new ReviewRepository(prisma);
  const moderationNotificationService = new ModerationNotificationService(prisma, maxApiClient);

  const userService = new UserService(userRepository);
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
  const autoPublicationService = new AutoPublicationService(prisma, adService, channelPublishingService);

  const startHandler = new StartHandler(userService, maxApiClient, {
    miniAppUrl: config.miniAppUrl,
    miniAppWebApp: config.max.miniAppWebApp,
    channelUrl: config.channelUrl
  });
  const botUpdateRouter = new BotUpdateRouter(startHandler);

  return {
    db: prisma,
    maxApiClient,
    userRepository,
    adRepository,
    moderationLogRepository,
    channelPublishLogRepository,
    favoriteRepository,
    reviewRepository,
    moderationNotificationService,
    userService,
    adService,
    moderationService,
    channelPublishingService,
    autoPublicationService,
    botUpdateRouter
  };
}

export type ApiContainer = ReturnType<typeof createContainer>;
