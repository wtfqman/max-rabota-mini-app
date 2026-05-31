import { ChannelPublishStatus, type Prisma } from '@rabst24/db';
import { logger } from '@rabst24/config';
import type { MaxApiClient, MaxMediaAttachment } from '@rabst24/max-api';
import type { AdRepository, AdWithDetailsRecord } from '../ads/ad.repository.js';
import type { ChannelPublishLogRepository } from './channel-publish-log.repository.js';
import type { ChannelPostFormatter } from './channel-post.formatter.js';

type ChannelMediaStrategyName = 'reusable_max_media_token' | 'fallback_max_upload' | 'text_only';

interface AdPhotoForChannel {
  id: string;
  url: string;
  previewUrl: string | null;
  mimeType: string | null;
  storageKey: string;
  maxMediaToken?: string | null;
  maxMediaType?: string | null;
}

interface PreparedChannelMedia {
  attachment: MaxMediaAttachment;
  strategy: ChannelMediaStrategyName;
  photoId: string;
  payload: Prisma.InputJsonValue;
}

interface ChannelMediaStrategy {
  readonly name: ChannelMediaStrategyName;
  prepare(photo: AdPhotoForChannel): Promise<PreparedChannelMedia | null>;
}

class ReusableMaxMediaStrategy implements ChannelMediaStrategy {
  readonly name = 'reusable_max_media_token' as const;

  async prepare(photo: AdPhotoForChannel): Promise<PreparedChannelMedia | null> {
    if (!photo.maxMediaToken) {
      return null;
    }

    return {
      strategy: this.name,
      photoId: photo.id,
      attachment: {
        type: this.getAttachmentType(photo),
        payload: {
          token: photo.maxMediaToken
        }
      },
      payload: {
        photoId: photo.id,
        source: 'stored_max_media_token'
      }
    };
  }

  private getAttachmentType(photo: AdPhotoForChannel): MaxMediaAttachment['type'] {
    if (photo.maxMediaType === 'video' || photo.mimeType?.startsWith('video/')) {
      return 'video';
    }

    return 'image';
  }
}

class FallbackUploadMediaStrategy implements ChannelMediaStrategy {
  readonly name = 'fallback_max_upload' as const;

  constructor(
    private readonly maxApiClient: MaxApiClient,
    private readonly adRepository: AdRepository,
    private readonly publicBaseUrl: string
  ) {}

  async prepare(photo: AdPhotoForChannel): Promise<PreparedChannelMedia | null> {
    const sourceUrl = this.toAbsoluteUrl(photo.url);
    const attachment = await this.maxApiClient.uploadMediaFromUrl({
      url: sourceUrl,
      fileName: this.getFileName(photo),
      mimeType: photo.mimeType ?? 'image/jpeg',
      uploadType: this.getUploadType(photo)
    });

    await this.adRepository.updatePhotoMaxMediaToken(photo.id, {
      token: attachment.payload.token,
      mediaType: attachment.type,
      strategy: this.name,
      payload: attachment.payload as Prisma.InputJsonValue
    });

    return {
      strategy: this.name,
      photoId: photo.id,
      attachment,
      payload: {
        photoId: photo.id,
        source: sourceUrl,
        tokenStored: true
      }
    };
  }

  private toAbsoluteUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }

    return `${this.publicBaseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
  }

  private getFileName(photo: AdPhotoForChannel): string {
    const fallback = photo.mimeType?.startsWith('video/') ? 'video.mp4' : photo.mimeType === 'image/png' ? 'image.png' : 'image.jpg';
    return photo.storageKey.split('/').pop() || fallback;
  }

  private getUploadType(photo: AdPhotoForChannel): Extract<MaxMediaAttachment['type'], 'image' | 'video' | 'file'> {
    if (photo.mimeType?.startsWith('video/')) {
      return 'video';
    }

    return 'image';
  }
}

export class ChannelPublishingService {
  private readonly mediaStrategies: ChannelMediaStrategy[];

  constructor(
    private readonly maxApiClient: MaxApiClient,
    private readonly channelPublishLogRepository: ChannelPublishLogRepository,
    private readonly channelPostFormatter: ChannelPostFormatter,
    adRepository: AdRepository,
    publicBaseUrl = 'https://app.rabst24.ru'
  ) {
    this.mediaStrategies = [
      new ReusableMaxMediaStrategy(),
      new FallbackUploadMediaStrategy(maxApiClient, adRepository, publicBaseUrl)
    ];
  }

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
    const preparedMedia = await this.prepareMainMedia(params.ad).catch((error: unknown) => {
      logger.warn({ err: error, adId: params.ad.id }, 'MAX media preparation failed, publishing text-only channel post');
      return {
        error: error instanceof Error ? error.message : 'Unknown MAX media preparation error'
      };
    });
    const media = this.isPreparedMedia(preparedMedia) ? preparedMedia : null;
    const mediaError = this.isMediaError(preparedMedia) ? preparedMedia.error : null;
    const ctaKeyboard = this.channelPostFormatter.createCtaKeyboard(params.ad);
    const attachments = media ? [media.attachment, ctaKeyboard] : [ctaKeyboard];

    const log = await this.channelPublishLogRepository.createPending({
      adId: params.ad.id,
      channelId: String(params.chatId),
      channelUrl: params.channelUrl,
      maxChatId: this.toStringOrNull(params.chatId),
      payload: {
        adId: params.ad.id,
        type: params.ad.type.toLowerCase(),
        mediaError
      },
      publishedText: text,
      mediaStrategy: media?.strategy ?? 'text_only',
      mediaAttachment: media?.payload ?? null
    });

    try {
      const response = await this.maxApiClient.sendMessage({
        chatId: params.chatId,
        disableLinkPreview: true,
        body: {
          text,
          format: 'markdown',
          attachments
        }
      });

      await this.channelPublishLogRepository.markPublished(log.id, this.extractMessageInfo(response));
      return {
        logId: log.id,
        response,
        mediaStrategy: media?.strategy ?? 'text_only'
      };
    } catch (error) {
      await this.channelPublishLogRepository.markFailed(
        log.id,
        error instanceof Error ? error.message : 'Unknown publication error'
      );
      throw error;
    }
  }

  async removeAdPublications(adId: string): Promise<{
    attempted: number;
    removed: number;
    failed: number;
    skipped: number;
  }> {
    const logs = await this.channelPublishLogRepository.listPublishedForAd(adId);
    let removed = 0;
    let failed = 0;

    for (const log of logs) {
      if (!log.maxMessageId) {
        continue;
      }

      try {
        await this.maxApiClient.deleteMessage(log.maxMessageId);
        await this.channelPublishLogRepository.markRemoved(log.id);
        removed += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'MAX channel post removal failed';
        await this.channelPublishLogRepository.markRemoveFailed(log.id, message);
        logger.warn({ err: error, adId, logId: log.id, maxMessageId: log.maxMessageId }, 'Unable to remove MAX channel post');
      }
    }

    return {
      attempted: logs.length,
      removed,
      failed,
      skipped: logs.length - removed - failed
    };
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

  private async prepareMainMedia(ad: AdWithDetailsRecord): Promise<PreparedChannelMedia | null> {
    const photo = ad.photos.find((item) => this.isImagePhoto(item)) ?? ad.photos.find((item) => this.isVideoMedia(item));

    if (!photo) {
      return null;
    }

    for (const strategy of this.mediaStrategies) {
      const prepared = await strategy.prepare(photo);
      if (prepared) {
        return prepared;
      }
    }

    return null;
  }

  private isImagePhoto(photo: AdPhotoForChannel): boolean {
    return !photo.mimeType || photo.mimeType.startsWith('image/');
  }

  private isVideoMedia(photo: AdPhotoForChannel): boolean {
    return Boolean(photo.mimeType?.startsWith('video/'));
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

    if (normalized === 'removed') {
      return ChannelPublishStatus.REMOVED;
    }

    if (normalized === 'remove_failed') {
      return ChannelPublishStatus.REMOVE_FAILED;
    }

    return undefined;
  }

  private extractMessageInfo(response: unknown): {
    maxMessageId?: string | null;
    maxMessageUrl?: string | null;
  } {
    const record = this.asRecord(response);
    const message = this.asRecord(record.message);
    const body = this.asRecord(message.body);
    const id = body.mid ?? message.message_id ?? message.id ?? record.message_id ?? record.id;
    const url = message.url ?? message.link ?? record.url ?? record.link;

    return {
      maxMessageId: typeof id === 'string' || typeof id === 'number' ? String(id) : null,
      maxMessageUrl: typeof url === 'string' ? url : null
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private isPreparedMedia(value: unknown): value is PreparedChannelMedia {
    return Boolean(value && typeof value === 'object' && 'attachment' in value && 'strategy' in value);
  }

  private isMediaError(value: unknown): value is { error: string } {
    return Boolean(value && typeof value === 'object' && 'error' in value);
  }

  private toStringOrNull(value: string | number | bigint): string | null {
    try {
      return String(value);
    } catch {
      return null;
    }
  }
}
