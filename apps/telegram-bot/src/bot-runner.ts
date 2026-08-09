import type { Bot } from 'grammy';
import { config, logger } from '@rabst24/config';
import type { TelegramApiClient } from '@rabst24/telegram';
import { sanitizeTelegramError } from './app/telegram-error-log.js';

const ALLOWED_UPDATES = ['message', 'channel_post', 'callback_query'] as const;
const START_RETRY_DELAY_MS = 30_000;

export class TelegramBotRunner {
  private isRunning = false;
  private isStopping = false;
  private catchRegistered = false;

  constructor(
    private readonly bot: Bot,
    private readonly telegramApiClient: TelegramApiClient
  ) {}

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!this.catchRegistered) {
      this.catchRegistered = true;
      this.bot.catch((error) => {
        logger.error(
          { err: sanitizeTelegramError(error.error), updateId: error.ctx.update.update_id },
          'Telegram bot update failed'
        );
      });
    }

    while (!this.isStopping) {
      try {
        const me = await this.telegramApiClient.getMe();
        await this.telegramApiClient.deleteWebhook(false);
        this.isRunning = true;
        logger.info({ botUsername: me.username ?? config.telegram.botUsername ?? null }, 'Telegram bot polling started');

        void this.bot.start({
          allowed_updates: ALLOWED_UPDATES
        }).catch((error) => {
          this.isRunning = false;
          if (this.isStopping) {
            return;
          }

          logger.error({ err: sanitizeTelegramError(error) }, 'Telegram bot polling stopped unexpectedly; retrying');
          void this.start();
        });
        return;
      } catch (error) {
        logger.error(
          { err: sanitizeTelegramError(error), retryInMs: START_RETRY_DELAY_MS },
          'Telegram bot startup failed; retrying'
        );
        await delay(START_RETRY_DELAY_MS);
      }
    }
  }

  async stop(): Promise<void> {
    this.isStopping = true;
    if (!this.isRunning) {
      return;
    }

    await this.bot.stop();
    this.isRunning = false;
    logger.info('Telegram bot polling stopped');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
