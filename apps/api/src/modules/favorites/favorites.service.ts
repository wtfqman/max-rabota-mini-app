import type { FavoriteRepository } from '@rabst24/core';
import { FoundationService, type FoundationRepository } from '../../shared/modules/module-status.js';

export class FavoritesService extends FoundationService {
  constructor(
    repository: FoundationRepository,
    private readonly favoriteRepository: FavoriteRepository
  ) {
    super(repository);
  }

  async list(userId: string) {
    return this.favoriteRepository.list(userId);
  }

  async add(userId: string, adId: string) {
    return this.favoriteRepository.add(userId, adId);
  }

  async remove(userId: string, adId: string) {
    await this.favoriteRepository.remove(userId, adId);
  }
}
