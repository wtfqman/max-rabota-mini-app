import type { FavoriteRepository } from '@rabst24/core';
import { FoundationService, type FoundationRepository } from '../../shared/modules/module-status.js';
import type { AdAnalyticsService } from '../ad-analytics/ad-analytics.service.js';

export class FavoritesService extends FoundationService {
  constructor(
    repository: FoundationRepository,
    private readonly favoriteRepository: FavoriteRepository,
    private readonly adAnalyticsService?: AdAnalyticsService
  ) {
    super(repository);
  }

  async list(userId: string) {
    return this.favoriteRepository.list(userId);
  }

  async add(userId: string, adId: string) {
    const favorite = await this.favoriteRepository.add(userId, adId);
    await this.adAnalyticsService?.recordSystemEvent(adId, 'favorite_add');
    return favorite;
  }

  async remove(userId: string, adId: string) {
    await this.favoriteRepository.remove(userId, adId);
    await this.adAnalyticsService?.recordSystemEvent(adId, 'favorite_remove');
  }
}
