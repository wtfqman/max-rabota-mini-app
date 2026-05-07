import type { AdService as CoreAdService } from '@rabst24/core';
import {
  canonicalizeCategory,
  canonicalizeDistrict,
  type AdListQueryDto,
  type AdTypeCode,
  type CreateAdDto
} from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { CreateTradeAdDto } from './trade.schemas.js';
import type { TradeRepository } from './trade.repository.js';

export class TradeService extends FoundationService {
  constructor(
    repository: TradeRepository,
    private readonly coreAdService: CoreAdService,
    private readonly adType: Extract<AdTypeCode, 'material' | 'tool'>
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
      benefits: []
    };

    return this.coreAdService.createAdForModeration(ownerId, createDto);
  }
}
