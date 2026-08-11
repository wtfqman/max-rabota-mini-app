import type { AdService as CoreAdService } from '@rabst24/core';
import { logger } from '@rabst24/config';
import { AdStatus } from '@rabst24/db';
import {
  canonicalizeCategory,
  canonicalizeDistrict,
  type AdListQueryDto,
  type AdTypeCode,
  type CreateAdDto
} from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ModerationNotificationService } from '../moderation/moderation-notification.service.js';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { CreateTradeAdDto } from './trade.schemas.js';
import type { TradeRepository } from './trade.repository.js';

export class TradeService extends FoundationService {
  constructor(
    repository: TradeRepository,
    private readonly coreAdService: CoreAdService,
    private readonly adType: Extract<AdTypeCode, 'material' | 'tool'>,
    private readonly moderationNotificationService: ModerationNotificationService,
    private readonly notificationService?: NotificationService
  ) {
    super(repository);
  }

  async listPublic(query: AdListQueryDto) {
    return this.coreAdService.listPublicAds(query, this.adType);
  }

  async getPublicDetails(adId: string) {
    return this.coreAdService.getPublicAdDetails(adId, this.adType);
  }

  async createForModeration(ownerId: string, dto: CreateTradeAdDto) {
    const categoryText = canonicalizeCategory(dto.categoryText);
    const districtText = canonicalizeDistrict(dto.districtText);
    const createDto: CreateAdDto = {
      type: this.adType,
      title: dto.title,
      description: dto.description,
      districtText,
      categoryText,
      priceAmount: dto.priceAmount,
      metadata: {
        address: dto.address
      },
      photos: dto.photos,
      contacts: dto.contacts,
      requirements: [],
      responsibilities: [],
      benefits: [],
      product: {}
    };

    const ad = await this.coreAdService.createAdForModeration(ownerId, createDto, {
      initialStatus: AdStatus.PENDING_MODERATION
    });

    logger.info(
      {
        ownerId,
        adId: ad.id,
        type: this.adType,
        paymentRequired: false
      },
      '[FREE_AD_CREATE] created'
    );

    void this.moderationNotificationService.notifyNewAd(ad, ownerId);
    await this.notifyFreeAdCreated(ownerId, ad.id, ad.title);

    return { ad, payment: null };
  }

  private async notifyFreeAdCreated(ownerId: string, adId: string, title: string): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    await this.notificationService.notify({
      userId: ownerId,
      type: 'AD_CREATED',
      title: 'Объявление создано',
      body: `Объявление «${title}» сохранено.`,
      category: 'ad_status',
      idempotencyKey: `ad:${adId}:created`,
      deepLink: this.notificationService.buildMyAdsLink(adId),
      payload: {
        adId,
        type: this.adType
      }
    });

    await this.notificationService.notify({
      userId: ownerId,
      type: 'AD_SUBMITTED_MODERATION',
      title: 'Отправлено на модерацию',
      body: `Объявление «${title}» отправлено на проверку.`,
      category: 'ad_status',
      critical: true,
      idempotencyKey: `ad:${adId}:submitted`,
      deepLink: this.notificationService.buildMyAdsLink(adId),
      payload: {
        adId,
        type: this.adType
      }
    });
  }
}
