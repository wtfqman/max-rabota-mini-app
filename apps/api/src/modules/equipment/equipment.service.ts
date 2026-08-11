import type { AdService as CoreAdService } from '@rabst24/core';
import { logger } from '@rabst24/config';
import { AdStatus } from '@rabst24/db';
import {
  canonicalizeCategory,
  canonicalizeDistrict,
  type AdListQueryDto,
  type CreateAdDto
} from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ModerationNotificationService } from '../moderation/moderation-notification.service.js';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { CreateEquipmentDto } from './equipment.schemas.js';
import type { EquipmentRepository } from './equipment.repository.js';

export class EquipmentService extends FoundationService {
  constructor(
    repository: EquipmentRepository,
    private readonly coreAdService: CoreAdService,
    private readonly moderationNotificationService: ModerationNotificationService,
    private readonly notificationService?: NotificationService
  ) {
    super(repository);
  }

  async listPublic(query: AdListQueryDto) {
    return this.coreAdService.listPublicAds(query, 'equipment');
  }

  async getPublicDetails(adId: string) {
    return this.coreAdService.getPublicAdDetails(adId, 'equipment');
  }

  async createForModeration(ownerId: string, dto: CreateEquipmentDto) {
    const categoryText = canonicalizeCategory(dto.categoryText);
    const districtText = canonicalizeDistrict(dto.districtText);
    const createDto: CreateAdDto = {
      type: 'equipment',
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
      equipment: {
        categoryText,
        rentalPrice: dto.priceAmount,
        salePrice: dto.priceAmount,
        currency: 'RUB'
      }
    };

    const ad = await this.coreAdService.createAdForModeration(ownerId, createDto, {
      initialStatus: AdStatus.PENDING_MODERATION
    });

    logger.info(
      {
        ownerId,
        adId: ad.id,
        type: 'equipment',
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
        type: 'equipment'
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
        type: 'equipment'
      }
    });
  }
}
