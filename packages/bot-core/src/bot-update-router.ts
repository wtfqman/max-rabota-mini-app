import { logger, saveDetectedMaxChannelChatId } from '@rabst24/config';
import type {
  MaxBotStartedUpdate,
  MaxMessageCreatedUpdate,
  MaxUpdate
} from '@rabst24/max-api';
import type { StartHandler } from './handlers/start.handler.js';

export class BotUpdateRouter {
  constructor(private readonly startHandler: StartHandler) {}

  async route(update: MaxUpdate): Promise<void> {
    try {
      if (isBotStartedUpdate(update)) {
        await this.startHandler.handleBotStarted(update);
        return;
      }

      if (isMessageCreatedUpdate(update)) {
        this.captureChannelContext(update);
        const text = update.message.body?.text?.trim();

        if (text === '/start' || text?.startsWith('/start ')) {
          await this.startHandler.handleStartMessage(update);
          return;
        }

        if (text && /^\/id(?:@\w+)?(?:\s|$)/i.test(text)) {
          await this.startHandler.handleIdMessage(update);
          return;
        }
      }

      logger.debug({ updateType: update.update_type }, 'Update skipped');
    } catch (error) {
      logger.error({ err: error, update }, 'Bot update handling failed');
    }
  }

  private captureChannelContext(update: MaxMessageCreatedUpdate): void {
    const recipient = update.message.recipient;
    const chatId = recipient?.chat_id;
    const chatType = recipient?.chat_type ?? recipient?.type;

    if (chatId === undefined || chatType !== 'channel') {
      return;
    }

    const state = saveDetectedMaxChannelChatId(chatId, { chatType });
    logger.info({ channelChatId: state.chatId, detectedAt: state.detectedAt }, 'Detected MAX channel chat id');
  }
}

function isBotStartedUpdate(update: MaxUpdate): update is MaxBotStartedUpdate {
  return update.update_type === 'bot_started' && 'user' in update;
}

function isMessageCreatedUpdate(update: MaxUpdate): update is MaxMessageCreatedUpdate {
  return update.update_type === 'message_created' && 'message' in update;
}
