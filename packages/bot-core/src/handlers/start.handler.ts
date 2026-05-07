import { logger } from '@rabst24/config';
import type { UserService } from '@rabst24/core';
import type {
  MaxApiClient,
  MaxBotStartedUpdate,
  MaxMessageCreatedUpdate,
  MaxUser
} from '@rabst24/max-api';
import { createStartKeyboard } from '../keyboards/start.keyboard.js';

export interface StartHandlerOptions {
  miniAppUrl: string;
  channelUrl?: string;
}

export class StartHandler {
  constructor(
    private readonly userService: UserService,
    private readonly maxApiClient: MaxApiClient,
    private readonly options: StartHandlerOptions
  ) {}

  async handleBotStarted(update: MaxBotStartedUpdate): Promise<void> {
    await this.registerAndWelcome(update.user, update.user_locale);
  }

  async handleStartMessage(update: MaxMessageCreatedUpdate): Promise<void> {
    const sender = update.message.sender;

    if (!sender) {
      logger.warn({ update }, 'Cannot handle /start without sender');
      return;
    }

    if (sender.is_bot) {
      logger.debug({ sender }, 'Ignored /start from bot account');
      return;
    }

    await this.registerAndWelcome(sender, update.user_locale);
  }

  private async registerAndWelcome(maxUser: MaxUser, locale?: string | null): Promise<void> {
    const user = await this.userService.registerFromMaxUser(maxUser, locale);

    await this.maxApiClient.sendMessage({
      userId: maxUser.user_id,
      body: {
        text:
          'Привет! Это Rabst24.\n\n' +
          'Основной интерфейс находится в mini app. Здесь можно открыть приложение и канал.',
        attachments: [
          createStartKeyboard({
            miniAppUrl: this.options.miniAppUrl,
            channelUrl: this.options.channelUrl
          })
        ]
      }
    });

    logger.info({ userId: user.id, maxUserId: user.maxUserId.toString() }, 'User started bot');
  }
}
