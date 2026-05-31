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
  miniAppWebApp?: string;
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

  async handleIdMessage(update: MaxMessageCreatedUpdate): Promise<void> {
    const sender = update.message.sender;

    if (!sender) {
      logger.warn({ update }, 'Cannot handle /id without sender');
      return;
    }

    if (sender.is_bot) {
      logger.debug({ sender }, 'Ignored /id from bot account');
      return;
    }

    const user = await this.userService.registerFromMaxUser(sender, update.user_locale);
    const maxUserId = user.maxUserId.toString();

    await this.maxApiClient.sendMessage({
      userId: sender.user_id,
      disableLinkPreview: true,
      body: {
        text: `Ваш MAX ID: ${maxUserId}\n\nСкопируйте этот ID и отправьте главному админу, чтобы он выдал доступ в разделе «Команда».`
      }
    });

    logger.info({ userId: user.id, maxUserId }, 'Sent MAX id to user');
  }

  private async registerAndWelcome(maxUser: MaxUser, locale?: string | null): Promise<void> {
    const user = await this.userService.registerFromMaxUser(maxUser, locale);
    const keyboard = createStartKeyboard({
      miniAppUrl: this.options.miniAppUrl,
      miniAppWebApp: this.options.miniAppWebApp,
      channelUrl: this.options.channelUrl
    });
    const hasMiniAppButton = keyboard.payload.buttons.some((row) =>
      row.some((button) => button.type === 'open_app' || button.text.includes('mini app'))
    );
    const welcomeText = hasMiniAppButton
      ? 'Привет! Это Бот строй.\n\nНажмите кнопку ниже, чтобы открыть mini app внутри MAX.'
      : 'Привет! Это Бот строй.\n\nMini app пока не настроен в конфигурации бота. Администратору нужно заполнить MAX_MINI_APP_WEB_APP.';

    try {
      await this.maxApiClient.sendMessage({
        userId: maxUser.user_id,
        disableLinkPreview: true,
        body: {
          text: welcomeText,
          attachments: keyboard.payload.buttons.length ? [keyboard] : []
        }
      });
    } catch (error) {
      logger.warn({ err: error, maxUserId: maxUser.user_id.toString() }, 'Failed to send start keyboard, retrying with plain text');

      await this.maxApiClient.sendMessage({
        userId: maxUser.user_id,
        disableLinkPreview: true,
        body: {
          text: `${welcomeText}\n\nЕсли кнопка не открывается, проверьте подключение mini app в MAX Partner.`
        }
      });
    }

    logger.info({ userId: user.id, maxUserId: user.maxUserId.toString() }, 'User started bot');
  }
}
