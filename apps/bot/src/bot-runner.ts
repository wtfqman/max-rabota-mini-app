import { config, logger } from '@rabst24/config';
import type { BotUpdateRouter } from '@rabst24/bot-core';
import type { MaxApiClient, MaxId } from '@rabst24/max-api';

const UPDATE_TYPES = ['message_created', 'bot_started', 'message_callback'];

export class BotRunner {
  private isRunning = false;
  private marker: MaxId | null = null;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly maxApiClient: MaxApiClient,
    private readonly updateRouter: BotUpdateRouter
  ) {}

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info('MAX long polling started');
    this.loopPromise = this.pollLoop();
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const page = await this.maxApiClient.getUpdates({
          marker: this.marker,
          limit: config.max.longPollingLimit,
          timeoutSeconds: config.max.longPollingTimeoutSeconds,
          types: UPDATE_TYPES
        });

        for (const update of page.updates) {
          await this.updateRouter.route(update);
        }

        this.marker = page.marker;
      } catch (error) {
        if (!this.isRunning) {
          break;
        }

        logger.error(
          {
            err: error,
            marker: this.marker,
            baseUrl: config.max.apiBaseUrl
          },
          'MAX long polling iteration failed'
        );
        await this.sleep(3000);
      }
    }

    logger.info('MAX long polling stopped');
  }

  private sleep(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, timeoutMs);
    });
  }
}
