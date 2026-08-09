import { randomUUID } from 'node:crypto';
import { config, logger } from '@rabst24/config';
import type { AdWithDetailsRecord } from '@rabst24/core';
import {
  ExternalPublicationSourcePlatform,
  ExternalPublicationStatus,
  TelegramTargetStatus,
  TelegramTargetType,
  type TelegramTarget
} from '@rabst24/db';
import { AppError, redactPhoneContacts } from '@rabst24/shared';
import { escapeTelegramHtml, type TelegramApiClient, type TelegramChatMember } from './telegram-api-client.js';
import type { ExternalPublicationRepository, TelegramTargetRepository } from './repositories.js';

export interface TelegramPublicationJobPayload {
  adId: string;
  targetId: string;
  source?: 'max' | 'telegram' | 'rabst24';
  publicationVersion?: number;
  correlationId?: string;
}

export class TelegramPublicationService {
  constructor(
    private readonly telegramApiClient: TelegramApiClient,
    private readonly targetRepository: TelegramTargetRepository,
    private readonly publicationRepository: ExternalPublicationRepository,
    private readonly options: {
      miniAppUrl: string;
      publicBaseUrl: string;
      testMode: boolean;
    }
  ) {}

  async checkTargetPermissions(target: TelegramTarget) {
    const chatRef = target.chatId ?? `@${target.username}`;

    try {
      const [bot, chat] = await Promise.all([
        this.telegramApiClient.getMe(),
        this.telegramApiClient.getChat(chatRef)
      ]);
      const member = await this.telegramApiClient.getChatMember(chat.id, bot.id);
      const state = this.buildPermissionState(chat, member);

      return this.targetRepository.updatePermissions(target.id, state);
    } catch (error) {
      const message = this.formatError(error);
      logger.warn({ err: error, targetId: target.id, username: target.username }, 'Telegram target permission check failed');

      return this.targetRepository.updatePermissions(target.id, {
        status: TelegramTargetStatus.UNAVAILABLE,
        botIsMember: false,
        botIsAdmin: false,
        canPostMessages: false,
        canEditMessages: false,
        canDeleteMessages: false,
        canSendMediaMessages: false,
        canManageTopics: false,
        lastError: message
      });
    }
  }

  async publishAdToTarget(input: {
    ad: AdWithDetailsRecord;
    target: TelegramTarget;
    sourcePlatform: ExternalPublicationSourcePlatform;
    publicationVersion?: number;
    correlationId?: string;
  }) {
    if (!config.features.TELEGRAM_OUTBOUND_PUBLICATION_ENABLED) {
      throw new AppError('Telegram outbound publication is disabled', 404, {
        code: 'FEATURE_DISABLED',
        feature: 'TELEGRAM_OUTBOUND_PUBLICATION_ENABLED'
      });
    }

    if (this.options.testMode && !input.target.testTarget) {
      return {
        status: 'skipped' as const,
        reason: 'Telegram test mode allows only test targets'
      };
    }

    if (!input.target.enabled || !input.target.publishEnabled || !input.target.chatId) {
      return {
        status: 'skipped' as const,
        reason: 'Telegram target is disabled or has no chat id'
      };
    }

    const publication = await this.publicationRepository.createPending({
      adId: input.ad.id,
      targetId: input.target.id,
      sourcePlatform: input.sourcePlatform,
      correlationId: input.correlationId ?? randomUUID(),
      publicationVersion: input.publicationVersion ?? 1
    });

    if (
      publication.status === ExternalPublicationStatus.PUBLISHED ||
      publication.status === ExternalPublicationStatus.EDITED
    ) {
      return {
        status: 'skipped' as const,
        reason: 'Telegram publication already exists',
        publicationId: publication.id
      };
    }

    try {
      const message = await this.sendAd(input.ad, input.target.chatId, input.target.messageThreadId);
      await Promise.all([
        this.publicationRepository.markPublished({
          id: publication.id,
          externalChatId: String(message.chatId),
          externalMessageId: String(message.messageId),
          externalMediaGroupId: message.mediaGroupId,
          externalUrl: this.buildMessageUrl(input.target, message.messageId)
        }),
        this.targetRepository.markPublishSuccess(input.target.id)
      ]);

      return {
        status: 'published' as const,
        publicationId: publication.id,
        messageId: message.messageId,
        mediaGroupId: message.mediaGroupId
      };
    } catch (error) {
      const message = this.formatError(error);
      await Promise.all([
        this.publicationRepository.markFailed(publication.id, message),
        this.targetRepository.markError(input.target.id, message)
      ]);
      throw error;
    }
  }

  async editPublication(publicationId: string, chatId: string, messageId: string, ad: AdWithDetailsRecord) {
    if (!config.features.TELEGRAM_EDIT_SYNC_ENABLED) {
      return {
        status: 'skipped' as const,
        reason: 'Telegram edit sync is disabled'
      };
    }

    await this.telegramApiClient.editMessageText({
      chatId,
      messageId,
      text: this.formatAd(ad),
      parseMode: 'HTML',
      replyMarkup: this.createKeyboard(ad)
    });
    await this.publicationRepository.markEdited(publicationId);

    return {
      status: 'edited' as const
    };
  }

  async deletePublication(publicationId: string, chatId: string, messageId: string) {
    if (!config.features.TELEGRAM_DELETE_SYNC_ENABLED) {
      return {
        status: 'skipped' as const,
        reason: 'Telegram delete sync is disabled'
      };
    }

    await this.telegramApiClient.deleteMessage(chatId, messageId);
    await this.publicationRepository.markDeleted(publicationId);

    return {
      status: 'deleted' as const
    };
  }

  listActivePublicationsForAd(adId: string) {
    return this.publicationRepository.listActiveForAd(adId);
  }

  async sendTestPost(target: TelegramTarget, kind: 'text' | 'photo' | 'video' | 'album' = 'text') {
    if (!target.chatId) {
      throw new AppError('Telegram target has no chat id', 409, {
        targetId: target.id
      });
    }

    const text = [
      '<b>RABST24 test publication</b>',
      `Target: ${escapeTelegramHtml(target.username)}`,
      `Kind: ${kind}`,
      'This message is sent only to a test target.'
    ].join('\n');
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: 'Open RABST24',
            url: this.options.miniAppUrl
          }
        ]
      ]
    };

    if (kind === 'photo') {
      return this.telegramApiClient.sendPhoto({
        chatId: target.chatId,
        messageThreadId: target.messageThreadId,
        photoUrl: 'https://app.rabst24.ru/favicon.ico',
        caption: text,
        parseMode: 'HTML',
        replyMarkup: keyboard
      });
    }

    if (kind === 'video') {
      return this.telegramApiClient.sendMessage({
        chatId: target.chatId,
        messageThreadId: target.messageThreadId,
        text: `${text}\nVideo smoke test uses text fallback until a staging media URL is provided.`,
        parseMode: 'HTML',
        replyMarkup: keyboard
      });
    }

    if (kind === 'album') {
      const media = await this.telegramApiClient.sendMediaGroup({
        chatId: target.chatId,
        messageThreadId: target.messageThreadId,
        media: [
          {
            type: 'photo',
            media: 'https://app.rabst24.ru/favicon.ico',
            caption: text,
            parse_mode: 'HTML'
          },
          {
            type: 'photo',
            media: 'https://app.rabst24.ru/favicon.ico'
          }
        ]
      });
      await this.telegramApiClient.sendMessage({
        chatId: target.chatId,
        messageThreadId: target.messageThreadId,
        text: '<b>RABST24 album buttons check</b>',
        parseMode: 'HTML',
        replyMarkup: keyboard
      });
      return media[0];
    }

    return this.telegramApiClient.sendMessage({
      chatId: target.chatId,
      messageThreadId: target.messageThreadId,
      text,
      parseMode: 'HTML',
      replyMarkup: keyboard,
      disableWebPagePreview: true
    });
  }

  private async sendAd(ad: AdWithDetailsRecord, chatId: string, messageThreadId?: string | null) {
    const text = this.formatAd(ad);
    const keyboard = this.createKeyboard(ad);
    const media = ad.photos.slice(0, 10).map((photo) => ({
      type: photo.mimeType?.startsWith('video/') ? 'video' as const : 'photo' as const,
      url: this.toPublicUrl(photo.url)
    }));

    if (media.length === 0) {
      const result = await this.telegramApiClient.sendMessage({
        chatId,
        messageThreadId,
        text,
        parseMode: 'HTML',
        replyMarkup: keyboard,
        disableWebPagePreview: true
      });
      return this.toMessageResult(result);
    }

    if (media.length === 1) {
      const item = media[0];
      const result = item.type === 'video'
        ? await this.telegramApiClient.sendVideo({
            chatId,
            messageThreadId,
            videoUrl: item.url,
            caption: text,
            parseMode: 'HTML',
            replyMarkup: keyboard
          })
        : await this.telegramApiClient.sendPhoto({
            chatId,
            messageThreadId,
            photoUrl: item.url,
            caption: text,
            parseMode: 'HTML',
            replyMarkup: keyboard
          });

      return this.toMessageResult(result);
    }

    const result = await this.telegramApiClient.sendMediaGroup({
      chatId,
      messageThreadId,
      media: media.map((item, index) => ({
        type: item.type,
        media: item.url,
        caption: index === 0 ? text : undefined,
        parse_mode: index === 0 ? 'HTML' : undefined
      }))
    });
    const buttonMessage = await this.telegramApiClient.sendMessage({
      chatId,
      messageThreadId,
      text: '<b>Открыть объявление RABST24</b>',
      parseMode: 'HTML',
      replyMarkup: keyboard
    });

    return {
      chatId: buttonMessage.chat.id,
      messageId: buttonMessage.message_id,
      mediaGroupId: result[0]?.media_group_id
    };
  }

  private toMessageResult(result: { chat: { id: number }; message_id: number; media_group_id?: string }) {
    return {
      chatId: result.chat.id,
      messageId: result.message_id,
      mediaGroupId: result.media_group_id
    };
  }

  private formatAd(ad: AdWithDetailsRecord): string {
    const type = ad.type.toLowerCase();
    const publicDescription = type === 'resume' ? redactPhoneContacts(ad.description) : ad.description;
    const lines = [
      `<b>${escapeTelegramHtml(this.getTypeLabel(type))}: ${escapeTelegramHtml(ad.title)}</b>`,
      ad.categoryText ? `Категория: ${escapeTelegramHtml(ad.categoryText)}` : null,
      ad.city ? `Город: ${escapeTelegramHtml(ad.city)}` : null,
      ad.districtText ? `Район: ${escapeTelegramHtml(ad.districtText)}` : null,
      this.getPriceLine(ad),
      publicDescription ? `\n${escapeTelegramHtml(publicDescription)}` : null,
      this.getContactsBlock(ad),
      `\n<a href="${escapeTelegramHtml(this.getAdUrl(ad))}">Открыть объявление в RABST24</a>`
    ];

    return lines.filter(Boolean).join('\n').slice(0, 4096);
  }

  private createKeyboard(ad: AdWithDetailsRecord) {
    const adUrl = this.getAdUrl(ad);
    return {
      inline_keyboard: [
        [
          {
            text: 'Открыть объявление',
            url: adUrl
          }
        ],
        [
          {
            text: 'Откликнуться',
            url: adUrl
          },
          {
            text: 'Пожаловаться',
            url: `${this.options.miniAppUrl}/ads/${ad.id}`
          }
        ]
      ]
    };
  }

  private getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      vacancy: 'Вакансия',
      resume: 'Резюме',
      equipment: 'Техника',
      material: 'Материалы',
      tool: 'Инструменты'
    };

    return labels[type] ?? 'Объявление';
  }

  private getPriceLine(ad: AdWithDetailsRecord): string | null {
    const salaryText = this.getMetadataString(ad, ['salaryText']);
    if (salaryText) {
      return `Р¦РµРЅР°: ${escapeTelegramHtml(salaryText)}`;
    }

    if (ad.resumeDetails?.expectedSalary) {
      return `Р¦РµРЅР°: ${escapeTelegramHtml(`${ad.resumeDetails.expectedSalary} ${ad.resumeDetails.salaryCurrency ?? ad.currency}`)}`;
    }

    const equipmentPrice =
      ad.equipmentDetails?.rentalPrice ??
      ad.equipmentDetails?.salePrice ??
      ad.equipmentDetails?.shiftPrice ??
      ad.equipmentDetails?.dailyPrice ??
      ad.equipmentDetails?.hourlyPrice;
    if (equipmentPrice) {
      return `Р¦РµРЅР°: ${escapeTelegramHtml(`${equipmentPrice} ${ad.equipmentDetails?.currency ?? ad.currency}`)}`;
    }

    if (ad.priceAmount === null || ad.priceAmount === undefined) {
      return null;
    }

    return `Цена: ${escapeTelegramHtml(`${ad.priceAmount} ${ad.currency}`)}`;
  }

  private getContactsBlock(ad: AdWithDetailsRecord): string | null {
    if (ad.type.toLowerCase() === 'resume') {
      return null;
    }

    const contacts = ad.contacts
      .map((contact) => contact.value?.trim())
      .filter((value): value is string => Boolean(value))
      .slice(0, 5);

    return contacts.length ? `\nКонтакты:\n${contacts.map(escapeTelegramHtml).join('\n')}` : null;
  }

  private getMetadataString(ad: AdWithDetailsRecord, keys: string[]): string | null {
    if (!ad.metadataJson) {
      return null;
    }

    try {
      const metadata = JSON.parse(ad.metadataJson) as unknown;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return null;
      }

      for (const key of keys) {
        const value = (metadata as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private getAdUrl(ad: AdWithDetailsRecord): string {
    const routes: Record<string, string> = {
      vacancy: 'vacancies',
      resume: 'resumes',
      equipment: 'equipment',
      material: 'materials',
      tool: 'tools'
    };
    const type = ad.type.toLowerCase();
    return `${this.options.miniAppUrl.replace(/\/+$/, '')}/${routes[type] ?? 'ads'}/${ad.id}`;
  }

  private toPublicUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }

    return `${this.options.publicBaseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
  }

  private buildPermissionState(chat: { id: number; type: string; title?: string }, member: TelegramChatMember) {
    const type = this.toTargetType(chat.type);
    const isAdmin = member.status === 'administrator' || member.status === 'creator';
    const isMember = isAdmin || member.status === 'member';
    const channelReady = type === TelegramTargetType.CHANNEL && isAdmin && member.can_post_messages === true;
    const groupReady = type !== TelegramTargetType.CHANNEL && isMember;
    const status = channelReady || groupReady
      ? TelegramTargetStatus.READY
      : isMember
        ? TelegramTargetStatus.NO_PERMISSION
        : TelegramTargetStatus.NOT_ADDED;

    return {
      chatId: chat.id,
      title: chat.title ?? null,
      type,
      status,
      botIsMember: isMember,
      botIsAdmin: isAdmin,
      canPostMessages: member.can_post_messages === true || type !== TelegramTargetType.CHANNEL,
      canEditMessages: member.can_edit_messages === true,
      canDeleteMessages: member.can_delete_messages === true,
      canSendMediaMessages: member.can_send_media_messages !== false,
      canManageTopics: member.can_manage_topics === true,
      lastError: status === TelegramTargetStatus.READY ? null : `Bot status is ${member.status}`
    };
  }

  private toTargetType(type: string): TelegramTargetType {
    if (type === 'channel') {
      return TelegramTargetType.CHANNEL;
    }

    if (type === 'supergroup') {
      return TelegramTargetType.SUPERGROUP;
    }

    return TelegramTargetType.GROUP;
  }

  private buildMessageUrl(target: TelegramTarget, messageId: number): string | null {
    if (!target.username || target.username.startsWith('chat_')) {
      return null;
    }

    return `https://t.me/${target.username}/${messageId}`;
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
