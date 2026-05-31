import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { paginationQuerySchema } from '@rabst24/shared';
import { validateRequest } from '../../shared/http/validate-request.js';
import { ModerationController } from './moderation.controller.js';
import { ModerationRepository } from './moderation.repository.js';
import {
  hideAdSchema,
  moderationAdParamSchema,
  moderationQueueQuerySchema,
  rejectAdSchema
} from './moderation.schemas.js';
import { ModerationModuleService } from './moderation.service.js';

export function createModerationRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new ModerationRepository(container.db);
  const service = new ModerationModuleService(
    repository,
    container.adService,
    container.moderationService,
    container.moderationLogRepository,
    container.channelPublishingService
  );
  const controller = new ModerationController(service);
  const adminOnly = [requireAuth, requireRole(['admin', 'moderator'])];

  router.get('/status', controller.status);
  router.get('/queue', adminOnly, validateRequest({ query: moderationQueueQuerySchema }), controller.queue);
  router.get('/ads/:adId', adminOnly, validateRequest({ params: moderationAdParamSchema }), controller.preview);
  router.post(
    '/ads/:adId/approve',
    adminOnly,
    validateRequest({ params: moderationAdParamSchema }),
    controller.approve
  );
  router.post(
    '/ads/:adId/reject',
    adminOnly,
    validateRequest({ params: moderationAdParamSchema, body: rejectAdSchema }),
    controller.reject
  );
  router.post(
    '/ads/:adId/hide',
    adminOnly,
    validateRequest({ params: moderationAdParamSchema, body: hideAdSchema }),
    controller.hide
  );
  router.post(
    '/ads/:adId/unpublish',
    adminOnly,
    validateRequest({ params: moderationAdParamSchema, body: hideAdSchema }),
    controller.unpublish
  );
  router.post(
    '/ads/:adId/archive',
    adminOnly,
    validateRequest({ params: moderationAdParamSchema, body: hideAdSchema }),
    controller.archive
  );
  router.delete(
    '/ads/:adId',
    adminOnly,
    validateRequest({ params: moderationAdParamSchema, body: hideAdSchema }),
    controller.delete
  );
  router.post(
    '/ads/:adId/remove-channel',
    adminOnly,
    validateRequest({ params: moderationAdParamSchema }),
    controller.removeFromChannel
  );
  router.get('/logs', adminOnly, validateRequest({ query: paginationQuerySchema }), controller.logs);

  return router;
}
