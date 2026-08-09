import { Bot } from 'grammy';
import { config } from '@rabst24/config';
import { prisma } from '@rabst24/db';
import {
  ExternalPublicationRepository,
  TelegramAccountRepository,
  TelegramApiClient,
  TelegramLinkingService,
  TelegramLinkTokenRepository,
  TelegramPublicationService,
  TelegramTargetRepository
} from '@rabst24/telegram';
import { TelegramAdminHandler } from '../handlers/admin.handler.js';
import { TelegramDraftHandler } from '../handlers/draft.handler.js';
import { TelegramStartHandler } from '../handlers/start.handler.js';
import { TelegramBotRunner } from '../bot-runner.js';

export function createTelegramBotContainer() {
  if (!config.telegram.botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required when Telegram bot is enabled');
  }

  const bot = new Bot(config.telegram.botToken, {
    client: {
      apiRoot: config.telegram.apiBaseUrl
    }
  });
  const telegramApiClient = new TelegramApiClient({
    token: config.telegram.botToken,
    baseUrl: config.telegram.apiBaseUrl
  });
  const accountRepository = new TelegramAccountRepository(prisma);
  const targetRepository = new TelegramTargetRepository(prisma);
  const externalPublicationRepository = new ExternalPublicationRepository(prisma);
  const linkTokenRepository = new TelegramLinkTokenRepository(prisma);
  const publicationService = new TelegramPublicationService(
    telegramApiClient,
    targetRepository,
    externalPublicationRepository,
    {
      miniAppUrl: config.miniAppUrl,
      publicBaseUrl: config.miniAppUrl,
      testMode: config.features.TELEGRAM_TEST_MODE
    }
  );
  const linkingService = new TelegramLinkingService(accountRepository, linkTokenRepository, {
    ttlMinutes: 15,
    hashPepper: config.session.secret
  });
  const startHandler = new TelegramStartHandler(accountRepository, linkingService);
  const adminHandler = new TelegramAdminHandler(targetRepository, publicationService);
  const draftHandler = new TelegramDraftHandler(accountRepository, linkingService);

  startHandler.register(bot);
  adminHandler.register(bot);
  draftHandler.register(bot);

  const runner = new TelegramBotRunner(bot, telegramApiClient);

  return {
    bot,
    runner,
    telegramApiClient,
    accountRepository,
    targetRepository,
    publicationService,
    linkingService
  };
}

export type TelegramBotContainer = ReturnType<typeof createTelegramBotContainer>;
