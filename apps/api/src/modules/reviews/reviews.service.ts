import type { ReviewRepository } from '@rabst24/core';
import { AdStatus } from '@rabst24/db';
import { AppError, type CreateReviewDto } from '@rabst24/shared';
import { FoundationService, type FoundationRepository } from '../../shared/modules/module-status.js';

export class ReviewsService extends FoundationService {
  constructor(
    repository: FoundationRepository,
    private readonly reviewRepository: ReviewRepository
  ) {
    super(repository);
  }

  async listForUser(userId: string) {
    return this.reviewRepository.listForUser(userId);
  }

  async create(authorId: string, subjectId: string, dto: CreateReviewDto) {
    if (authorId === subjectId) {
      throw new AppError('Нельзя оставить отзыв самому себе.', 400);
    }

    const ad = await this.reviewRepository.findTargetAd(dto.adId);

    if (!ad) {
      throw new AppError('Объявление для отзыва не найдено.', 404);
    }

    if (ad.ownerId !== subjectId) {
      throw new AppError('Отзыв можно оставить только владельцу этого объявления.', 400);
    }

    if (ad.status !== AdStatus.APPROVED && ad.status !== AdStatus.PUBLISHED) {
      throw new AppError('Отзыв можно оставить после публикации объявления.', 400);
    }

    const existing = await this.reviewRepository.findByAuthorSubjectAd(authorId, subjectId, dto.adId);
    if (existing) {
      throw new AppError('Вы уже оставили отзыв по этому объявлению.', 409);
    }

    return this.reviewRepository.create(authorId, subjectId, dto);
  }
}
