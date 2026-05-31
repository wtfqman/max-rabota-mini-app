import type {
  AdService as CoreAdService,
  ChannelPublishingService as CoreChannelPublishingService
} from '@rabst24/core';
import { AdStatus } from '@rabst24/db';
import { config, getResolvedMaxChannelChatId } from '@rabst24/config';
import type { AdListQueryDto } from '@rabst24/shared';
import { AppError } from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ModerationNotificationService } from '../moderation/moderation-notification.service.js';
import type { AdsRepository } from './ads.repository.js';
import type { OwnedAdsQuery, PublicationSettingsDto, UpdateOwnedAdDto } from './ads.schemas.js';

export class AdsService extends FoundationService {
  constructor(
    repository: AdsRepository,
    private readonly coreAdService: CoreAdService,
    private readonly channelPublishingService: CoreChannelPublishingService,
    private readonly moderationNotificationService: ModerationNotificationService
  ) {
    super(repository);
  }

  async listPublic(query: AdListQueryDto) {
    return this.coreAdService.listPublicAds(query);
  }

  async getPublicDetails(adId: string) {
    return this.coreAdService.getPublicAdDetails(adId);
  }

  async listMy(ownerId: string, query: OwnedAdsQuery) {
    return this.coreAdService.listOwnerAds(ownerId, query);
  }

  async updateMine(ownerId: string, adId: string, dto: UpdateOwnedAdDto) {
    return this.coreAdService.updateOwnerAd(ownerId, adId, dto);
  }

  async updatePublicationSettings(ownerId: string, adId: string, dto: PublicationSettingsDto) {
    return this.coreAdService.updateOwnerPublicationSettings(ownerId, adId, dto);
  }

  async hideMine(ownerId: string, adId: string) {
    const ad = await this.coreAdService.hideOwnerAd(ownerId, adId);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return { ad, channelRemoval };
  }

  async archiveMine(ownerId: string, adId: string) {
    const ad = await this.coreAdService.archiveOwnerAd(ownerId, adId);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return { ad, channelRemoval };
  }

  async deleteMine(ownerId: string, adId: string) {
    const ad = await this.coreAdService.deleteOwnerAd(ownerId, adId);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return { ad, channelRemoval };
  }

  async resubmitMine(ownerId: string, adId: string) {
    const current = await this.coreAdService.getOwnedAdDetails(ownerId, adId);

    if (current.status === AdStatus.APPROVED || current.status === AdStatus.PUBLISHED) {
      const channelChatId = getResolvedMaxChannelChatId();

      if (!channelChatId) {
        throw new AppError('MAX channel chat id is not configured', 400);
      }

      await this.channelPublishingService.publishApprovedAd({
        chatId: channelChatId,
        channelUrl: config.channelUrl,
        ad: current
      });

      return this.coreAdService.markAdPublished(adId);
    }

    const ad = await this.coreAdService.resubmitOwnerAd(ownerId, adId);
    void this.moderationNotificationService.notifyNewAd(ad, ownerId);

    return ad;
  }
}
