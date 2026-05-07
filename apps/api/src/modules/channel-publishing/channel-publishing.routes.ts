import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { ChannelPublishingController } from './channel-publishing.controller.js';
import { ChannelPublishingRepository } from './channel-publishing.repository.js';
import {
  publishAdParamSchema,
  publishAdSchema,
  publishLogsQuerySchema
} from './channel-publishing.schemas.js';
import { ChannelPublishingModuleService } from './channel-publishing.service.js';

export function createChannelPublishingRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new ChannelPublishingRepository(container.db);
  const service = new ChannelPublishingModuleService(
    repository,
    container.adService,
    container.channelPublishingService
  );
  const controller = new ChannelPublishingController(service);
  const adminOnly = [requireAuth, requireRole(['admin', 'moderator'])];

  router.get('/status', controller.status);
  router.post(
    '/publish/:adId',
    adminOnly,
    validateRequest({ params: publishAdParamSchema, body: publishAdSchema }),
    controller.publish
  );
  router.get('/publish-logs', adminOnly, validateRequest({ query: publishLogsQuerySchema }), controller.logs);

  return router;
}
