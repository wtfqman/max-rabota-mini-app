import { UserRepository, UserService } from '@rabst24/core';
import { config } from '@rabst24/config';
import { prisma } from '@rabst24/db';
import { BotUpdateRouter, StartHandler } from '@rabst24/bot-core';
import { MaxApiClient } from '@rabst24/max-api';
import { BotRunner } from '../bot-runner.js';

export function createBotContainer() {
  const maxApiClient = new MaxApiClient({
    baseUrl: config.max.apiBaseUrl,
    token: config.max.botToken
  });

  const userRepository = new UserRepository(prisma);
  const userService = new UserService(userRepository);

  const startHandler = new StartHandler(userService, maxApiClient, {
    miniAppUrl: config.miniAppUrl,
    channelUrl: config.channelUrl
  });
  const botUpdateRouter = new BotUpdateRouter(startHandler);
  const botRunner = new BotRunner(maxApiClient, botUpdateRouter);

  return {
    maxApiClient,
    userService,
    botUpdateRouter,
    botRunner
  };
}
