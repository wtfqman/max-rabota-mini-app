import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { requireFeature } from '../../shared/feature-flags/feature-guard.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { TelegramSyncController } from './telegram-sync.controller.js';
import {
  telegramLinkConsumeSchema,
  telegramTargetIdParamSchema,
  telegramTestPublishSchema
} from './telegram-sync.schemas.js';

export function createTelegramSyncRouter(container: ApiContainer): Router {
  const router = Router();
  const controller = new TelegramSyncController(container.telegramSyncService);
  const adminOnly = [requireAuth, requireRole(['admin', 'moderator'])];

  router.use(requireFeature('TELEGRAM_SYNC_ENABLED'));
  router.get('/status', controller.status);
  router.post('/link/consume', requireFeature('TELEGRAM_ACCOUNT_LINKING_ENABLED'), requireAuth, validateRequest({ body: telegramLinkConsumeSchema }), controller.consumeLinkCode);
  router.get('/targets', adminOnly, controller.targets);
  router.post('/targets/check-all', adminOnly, controller.checkAllTargets);
  router.post('/targets/:targetId/check', adminOnly, validateRequest({ params: telegramTargetIdParamSchema }), controller.checkTarget);
  router.post('/targets/:targetId/enable', adminOnly, validateRequest({ params: telegramTargetIdParamSchema }), controller.enableTarget);
  router.post('/targets/:targetId/disable', adminOnly, validateRequest({ params: telegramTargetIdParamSchema }), controller.disableTarget);
  router.post(
    '/targets/:targetId/test-publish',
    adminOnly,
    validateRequest({ params: telegramTargetIdParamSchema, body: telegramTestPublishSchema }),
    controller.testPublish
  );

  return router;
}
