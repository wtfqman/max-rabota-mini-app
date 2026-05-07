import { AdStatus } from '@rabst24/db';
import { config, getResolvedMaxChannelChatId } from '@rabst24/config';
import type {
  AdService as CoreAdService,
  ChannelPublishingService as CoreChannelPublishingService
} from '@rabst24/core';
import { AppError } from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ChannelPublishingRepository } from './channel-publishing.repository.js';
import type { PublishAdDto, PublishLogsQuery } from './channel-publishing.schemas.js';

export class ChannelPublishingModuleService extends FoundationService {
  constructor(
    repository: ChannelPublishingRepository,
    private readonly adService: CoreAdService,
    private readonly channelPublishingService: CoreChannelPublishingService
  ) {
    super(repository);
  }

  async publish(adId: string, dto: PublishAdDto) {
    const ad = await this.adService.getAdDetails(adId);
    const channelId = dto.channelId ?? getResolvedMaxChannelChatId();

    if (!channelId) {
      throw new AppError('MAX channel chat id is not configured', 400);
    }

    if (ad.status !== AdStatus.APPROVED && ad.status !== AdStatus.PUBLISHED) {
      throw new AppError('Only approved or published ads can be published to channel', 409, {
        status: ad.status.toLowerCase()
      });
    }

    const result = await this.channelPublishingService.publishApprovedAd({
      chatId: channelId,
      channelUrl: config.channelUrl,
      ad
    });

    await this.adService.markAdPublished(adId);

    return result;
  }

  async listLogs(query: PublishLogsQuery) {
    return this.channelPublishingService.listLogs(query);
  }
}
