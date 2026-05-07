import type { AdService as CoreAdService } from '@rabst24/core';
import type { AdListQueryDto } from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { AdsRepository } from './ads.repository.js';
import type { OwnedAdsQuery, UpdateOwnedAdDto } from './ads.schemas.js';

export class AdsService extends FoundationService {
  constructor(
    repository: AdsRepository,
    private readonly coreAdService: CoreAdService
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

  async hideMine(ownerId: string, adId: string) {
    return this.coreAdService.hideOwnerAd(ownerId, adId);
  }

  async resubmitMine(ownerId: string, adId: string) {
    return this.coreAdService.resubmitOwnerAd(ownerId, adId);
  }
}
