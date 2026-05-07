import { ChannelPublishStatus, type Prisma } from '@rabst24/db';
import type { MaxApiClient } from '@rabst24/max-api';
import type { AdWithDetailsRecord } from '../ads/ad.repository.js';
import type { ChannelPublishLogRepository } from './channel-publish-log.repository.js';
import type { ChannelPostFormatter } from './channel-post.formatter.js';

export class ChannelPublishingService {
  constructor(
    private readonly maxApiClient: MaxApiClient,
    private readonly channelPublishLogRepository: ChannelPublishLogRepository,
    private readonly channelPostFormatter: ChannelPostFormatter
  ) {}

  async enqueueAdPublication(params: {
    adId: string;
    channelId?: string | null;
    channelUrl?: string | null;
    maxChatId?: string | null;
    payload?: Prisma.InputJsonValue;
    publishedText?: string | null;
  }) {
    return this.channelPublishLogRepository.createPending(params);
  }

  async publishApprovedAd(params: {
    chatId: string | number | bigint;
    channelUrl?: string | null;
    ad: AdWithDetailsRecord;
  }) {
    const text = this.channelPostFormatter.formatAd(params.ad);
    const log = await this.channelPublishLogRepository.createPending({
      adId: params.ad.id,
      channelId: String(params.chatId),
      channelUrl: params.channelUrl,
      maxChatId: this.toStringOrNull(params.chatId),
      payload: {
        adId: params.ad.id,
        type: params.ad.type.toLowerCase()
      },
      publishedText: text
    });

    try {
      const response = await this.maxApiClient.sendMessage({
        chatId: params.chatId,
        body: {
          text
        }
      });

      await this.channelPublishLogRepository.markPublished(log.id, this.extractMessageInfo(response));
      return {
        logId: log.id,
        response
      };
    } catch (error) {
      await this.channelPublishLogRepository.markFailed(
        log.id,
        error instanceof Error ? error.message : 'Unknown publication error'
      );
      throw error;
    }
  }

  async listLogs(params: {
    adId?: string;
    status?: string;
    page: number;
    perPage: number;
  }) {
    return this.channelPublishLogRepository.list({
      adId: params.adId,
      status: this.mapStatus(params.status),
      page: params.page,
      perPage: params.perPage
    });
  }

  private mapStatus(status: string | undefined): ChannelPublishStatus | undefined {
    if (!status) {
      return undefined;
    }

    const normalized = status.toLowerCase();

    if (normalized === 'pending') {
      return ChannelPublishStatus.PENDING;
    }

    if (normalized === 'published') {
      return ChannelPublishStatus.PUBLISHED;
    }

    if (normalized === 'failed') {
      return ChannelPublishStatus.FAILED;
    }

    if (normalized === 'skipped') {
      return ChannelPublishStatus.SKIPPED;
    }

    return undefined;
  }

  private extractMessageInfo(response: unknown): {
    maxMessageId?: string | null;
    maxMessageUrl?: string | null;
  } {
    if (!response || typeof response !== 'object') {
      return {};
    }

    const record = response as Record<string, unknown>;
    const id = record.message_id ?? record.id;
    const url = record.url ?? record.link;

    return {
      maxMessageId: typeof id === 'string' || typeof id === 'number' ? String(id) : null,
      maxMessageUrl: typeof url === 'string' ? url : null
    };
  }

  private toStringOrNull(value: string | number | bigint): string | null {
    try {
      return String(value);
    } catch {
      return null;
    }
  }
}
