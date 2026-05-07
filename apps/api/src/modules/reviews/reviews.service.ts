import type { ReviewRepository } from '@rabst24/core';
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
      throw new AppError('Cannot review yourself', 400);
    }

    return this.reviewRepository.create(authorId, subjectId, dto);
  }
}
