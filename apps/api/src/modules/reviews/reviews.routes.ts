import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsRepository } from './reviews.repository.js';
import { createReviewSchema, reviewUserParamSchema } from './reviews.schemas.js';
import { ReviewsService } from './reviews.service.js';

export function createReviewsRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new ReviewsRepository(container.db);
  const service = new ReviewsService(repository, container.reviewRepository);
  const controller = new ReviewsController(service);

  router.get('/status', controller.status);
  router.get('/me', requireAuth, controller.me);
  router.get('/users/:userId', validateRequest({ params: reviewUserParamSchema }), controller.listForUser);
  router.post(
    '/users/:userId',
    requireAuth,
    validateRequest({ params: reviewUserParamSchema, body: createReviewSchema }),
    controller.create
  );

  return router;
}
