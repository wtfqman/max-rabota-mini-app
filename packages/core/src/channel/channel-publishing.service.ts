import { AdStatus, ChannelPublishStatus, UserStatus, type Prisma } from '@rabst24/db';
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

export type ChannelPublicationResult =
  | {
      status: 'published';
      logId: string;
      response: unknown;
      mediaStrategy: ChannelMediaStrategyName;
    }
  | {
      status: 'skipped';
      reason: string;
      logId?: string;
      mediaStrategy?: ChannelMediaStrategyName;
    };

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
  private static readonly duplicateGuardWindowMs = 5 * 60 * 1000;
  private readonly activePublicationKeys = new Set<string>();
  private readonly mediaStrategies: ChannelMediaStrategy[];

  constructor(
    private readonly maxApiClient: MaxApiClient,
    private readonly channelPublishLogRepository: ChannelPublishLogRepository,
    private readonly channelPostFormatter: ChannelPostFormatter,
    private readonly adRepository: AdRepository,
    publicBaseUrl = 'https://app.rabst24.ru'
  ) {
    this.mediaStrategies = [
      new ReusableMaxMediaStrategy(),
      new FallbackUploadMediaStrategy(maxApiClient, this.adRepository, publicBaseUrl)
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
  }): Promise<ChannelPublicationResult> {
    const maxChatId = this.toStringOrNull(params.chatId);
    const publicationKey = this.getPublicationKey(params.ad.id, maxChatId);

    if (this.activePublicationKeys.has(publicationKey)) {
      return {
        status: 'skipped',
        reason: 'Publication is already in progress'
      };
    }

    this.activePublicationKeys.add(publicationKey);

    try {
      const ad = await this.findPublishableAd(params.ad.id);

      if (!ad) {
        return {
          status: 'skipped',
          reason: 'Ad is no longer approved or published'
        };
      }

      const recentAttempt = await this.channelPublishLogRepository.findRecentActiveAttempt({
        adId: ad.id,
        maxChatId,
        since: new Date(Date.now() - ChannelPublishingService.duplicateGuardWindowMs)
      });

      if (recentAttempt) {
        return {
          status: 'skipped',
          logId: recentAttempt.id,
          reason:
            recentAttempt.status === ChannelPublishStatus.PENDING
              ? 'Publication is already in progress'
              : 'Recent publication already exists',
          mediaStrategy: this.toKnownMediaStrategy(recentAttempt.mediaStrategy)
        };
      }

      const text = this.channelPostFormatter.formatAd(ad);
      const log = await this.channelPublishLogRepository.createPending({
        adId: ad.id,
        channelId: String(params.chatId),
        channelUrl: params.channelUrl,
        maxChatId,
        payload: {
          adId: ad.id,
          type: ad.type.toLowerCase(),
          duplicateGuardWindowMs: ChannelPublishingService.duplicateGuardWindowMs
        },
        publishedText: text
      });
      const preparedMedia = await this.prepareMainMedia(ad).catch((error: unknown) => {
        logger.warn({ err: error, adId: ad.id }, 'MAX media preparation failed, publishing text-only channel post');
        return {
          error: error instanceof Error ? error.message : 'Unknown MAX media preparation error'
        };
      });
      const media = this.isPreparedMedia(preparedMedia) ? preparedMedia : null;
      const mediaError = this.isMediaError(preparedMedia) ? preparedMedia.error : null;
      const ctaKeyboard = this.channelPostFormatter.createCtaKeyboard(ad);
      const attachments = media ? [media.attachment, ctaKeyboard] : [ctaKeyboard];

      await this.channelPublishLogRepository.updatePendingPayload(log.id, {
        payload: {
          adId: ad.id,
          type: ad.type.toLowerCase(),
          duplicateGuardWindowMs: ChannelPublishingService.duplicateGuardWindowMs,
          mediaError
        },
        publishedText: text,
        mediaStrategy: media?.strategy ?? 'text_only',
        mediaAttachment: media?.payload ?? null
      });

      if (!(await this.isAdPublishable(ad.id))) {
        const reason = 'Ad is no longer approved or published';
        await this.channelPublishLogRepository.markSkipped(log.id, reason);

        return {
          status: 'skipped',
          logId: log.id,
          reason,
          mediaStrategy: media?.strategy ?? 'text_only'
        };
      }

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
        const messageInfo = this.extractMessageInfo(response);

        await this.channelPublishLogRepository.markPublished(log.id, messageInfo);

        if (!(await this.isAdPublishable(ad.id))) {
          const reason = 'Ad changed status after MAX accepted the post';
          await this.removeJustPublishedMessage(log.id, messageInfo, ad.id, reason);

          return {
            status: 'skipped',
            logId: log.id,
            reason,
            mediaStrategy: media?.strategy ?? 'text_only'
          };
        }

        return {
          status: 'published',
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
    } finally {
      this.activePublicationKeys.delete(publicationKey);
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

  private getPublicationKey(adId: string, maxChatId: string | null): string {
    return `${adId}:${maxChatId ?? 'default'}`;
  }

  private async findPublishableAd(adId: string): Promise<AdWithDetailsRecord | null> {
    const ad = await this.adRepository.findWithDetailsById(adId);

    if (!ad || !this.isPublishableAd(ad)) {
      return null;
    }

    return ad;
  }

  private async isAdPublishable(adId: string): Promise<boolean> {
    return Boolean(await this.findPublishableAd(adId));
  }

  private isPublishableAd(ad: AdWithDetailsRecord): boolean {
    return (
      (ad.status === AdStatus.APPROVED || ad.status === AdStatus.PUBLISHED) &&
      !ad.deletedAt &&
      !ad.hiddenAt &&
      !ad.archivedAt &&
      ad.owner.status === UserStatus.ACTIVE &&
      !ad.owner.deletedAt
    );
  }

  private toKnownMediaStrategy(value: string | null): ChannelMediaStrategyName | undefined {
    if (value === 'reusable_max_media_token' || value === 'fallback_max_upload' || value === 'text_only') {
      return value;
    }

    return undefined;
  }

  private async removeJustPublishedMessage(
    logId: string,
    messageInfo: {
      maxMessageId?: string | null;
      maxMessageUrl?: string | null;
    },
    adId: string,
    reason: string
  ): Promise<void> {
    if (!messageInfo.maxMessageId) {
      await this.channelPublishLogRepository.markFailed(logId, `${reason}; MAX message id is unavailable`);
      return;
    }

    try {
      await this.maxApiClient.deleteMessage(messageInfo.maxMessageId);
      await this.channelPublishLogRepository.markRemoved(logId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MAX channel post removal failed';
      await this.channelPublishLogRepository.markRemoveFailed(logId, message);
      logger.warn({ err: error, adId, logId, maxMessageId: messageInfo.maxMessageId }, 'Unable to remove stale MAX channel post');
    }
  }
}
