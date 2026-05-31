import type { AdService as CoreAdService } from '@rabst24/core';
import {
  canonicalizeCategory,
  canonicalizeDistrict,
  type AdListQueryDto,
  type CreateAdDto
} from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ModerationNotificationService } from '../moderation/moderation-notification.service.js';
import type { CreateEquipmentDto } from './equipment.schemas.js';
import type { EquipmentRepository } from './equipment.repository.js';

export class EquipmentService extends FoundationService {
  constructor(
    repository: EquipmentRepository,
    private readonly coreAdService: CoreAdService,
    private readonly moderationNotificationService: ModerationNotificationService
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
      metadata: {
        address: dto.address,
        equipmentGroupText: dto.equipmentGroupText
      },
      photos: dto.photos,
      contacts: dto.contacts,
      requirements: [],
      responsibilities: [],
      benefits: [],
      equipment: {
        categoryText
      }
    };

    const ad = await this.coreAdService.createAdForModeration(ownerId, createDto);
    void this.moderationNotificationService.notifyNewAd(ad, ownerId);

    return ad;
  }
}
