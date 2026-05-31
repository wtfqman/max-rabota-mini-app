import type { Request, Response } from 'express';
import { AppError, type CreateReviewDto } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendCreated, sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { ReviewsService } from './reviews.service.js';

export class ReviewsController extends FoundationController {
  constructor(private readonly reviewsService: ReviewsService) {
    super(reviewsService);
  }

  me = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const reviews = await this.reviewsService.listForUser(this.requireUserId(request));
    sendOk(response, serializeReviews(reviews));
  });

  listForUser = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const reviews = await this.reviewsService.listForUser(request.params.userId);
    sendOk(response, serializeReviews(reviews));
  });

  create = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const review = await this.reviewsService.create(
      this.requireUserId(request),
      request.params.userId,
      request.body as CreateReviewDto
    );

    sendCreated(response, {
      id: review.id,
      subjectId: review.subjectId,
      rating: review.rating,
      text: review.text,
      createdAt: review.createdAt.toISOString()
    });
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}

function serializeReviews(reviews: Awaited<ReturnType<ReviewsService['listForUser']>>) {
  return reviews.map((review) => ({
    id: review.id,
    author: {
      id: review.author.id,
      displayName:
        review.author.displayName ??
        [review.author.firstName, review.author.lastName].filter(Boolean).join(' ') ??
        review.author.maxUsername,
      maxUsername: review.author.maxUsername
    },
    rating: review.rating,
    text: review.text,
    adId: review.adId,
    ad: review.ad
      ? {
          id: review.ad.id,
          title: review.ad.title,
          type: review.ad.type.toLowerCase()
        }
      : null,
    createdAt: review.createdAt.toISOString()
  }));
}
