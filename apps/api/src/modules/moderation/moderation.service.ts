import { config, getResolvedMaxChannelChatId, logger } from '@rabst24/config';
import type {
  AdService as CoreAdService,
  ChannelPublishingService,
  ModerationLogRepository,
  ModerationService as CoreModerationService
} from '@rabst24/core';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ModerationQueueQuery } from './moderation.schemas.js';
import type { ModerationRepository } from './moderation.repository.js';

export class ModerationModuleService extends FoundationService {
  constructor(
    repository: ModerationRepository,
    private readonly adService: CoreAdService,
    private readonly moderationService: CoreModerationService,
    private readonly moderationLogRepository: ModerationLogRepository,
    private readonly channelPublishingService: ChannelPublishingService
  ) {
    super(repository);
  }

  async listQueue(query: ModerationQueueQuery) {
    return this.adService.listModerationQueue(query);
  }

  async getPreview(adId: string) {
    return this.adService.getAdDetails(adId);
  }

  async approve(adId: string, moderatorId: string) {
    await this.moderationService.approveAd(adId, moderatorId);
    const ad = await this.adService.getAdDetails(adId);
    const publication = await this.publishAfterApprove(ad);

    if (publication.status === 'published') {
      return {
        ad: await this.adService.markAdPublished(adId),
        publication
      };
    }

    return {
      ad,
      publication
    };
  }

  async reject(adId: string, moderatorId: string, reason: string) {
    await this.moderationService.rejectAd(adId, moderatorId, reason);

    return {
      ad: await this.adService.getAdDetails(adId)
    };
  }

  async hide(adId: string, moderatorId: string, reason?: string) {
    await this.moderationService.hideAd(adId, moderatorId, reason);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return {
      ad: await this.adService.getAdDetails(adId),
      channelRemoval
    };
  }

  async unpublish(adId: string, moderatorId: string, reason?: string) {
    await this.moderationService.unpublishAd(adId, moderatorId, reason);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return {
      ad: await this.adService.getAdDetails(adId),
      channelRemoval
    };
  }

  async archive(adId: string, moderatorId: string, reason?: string) {
    await this.moderationService.archiveAd(adId, moderatorId, reason);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return {
      ad: await this.adService.getAdDetails(adId),
      channelRemoval
    };
  }

  async delete(adId: string, moderatorId: string, reason?: string) {
    await this.moderationService.deleteAd(adId, moderatorId, reason);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return {
      ad: await this.adService.getAdDetails(adId),
      channelRemoval
    };
  }

  async removeFromChannel(adId: string, moderatorId: string) {
    await this.moderationService.logChannelRemoved(adId, moderatorId, 'Снятие публикации из канала');
    const ad = await this.adService.getAdDetails(adId);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return {
      ad,
      channelRemoval
    };
  }

  async listLogs(query: { page: number; perPage: number; adId?: string; moderatorId?: string }) {
    return this.moderationLogRepository.list(query);
  }

  private async publishAfterApprove(ad: Awaited<ReturnType<CoreAdService['getAdDetails']>>) {
    const channelChatId = getResolvedMaxChannelChatId();

    if (!channelChatId) {
      await this.channelPublishingService.enqueueAdPublication({
        adId: ad.id,
        channelUrl: config.channelUrl,
        payload: {
          skippedReason: 'MAX_CHANNEL_CHAT_ID is not configured'
        },
        publishedText: null
      });

      return {
        status: 'skipped' as const,
        reason: 'MAX_CHANNEL_CHAT_ID is not configured'
      };
    }

    try {
      const result = await this.channelPublishingService.publishApprovedAd({
        chatId: channelChatId,
        channelUrl: config.channelUrl,
        ad
      });

      return {
        status: 'published' as const,
        logId: result.logId,
        mediaStrategy: result.mediaStrategy
      };
    } catch (error) {
      logger.error({ err: error, adId: ad.id }, 'Channel publication after moderation failed');

      return {
        status: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown publication error'
      };
    }
  }
}
