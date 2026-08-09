import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { AdReportsController } from './ad-reports.controller.js';
import { AdReportsService } from './ad-reports.service.js';
import {
  adReportIdParamSchema,
  adReportModerationQuerySchema,
  createAdReportSchema,
  resolveAdReportSchema
} from './ad-reports.schemas.js';

export function createAdReportsRouter(container: ApiContainer): Router {
  const router = Router();
  const service = new AdReportsService(
    container.db,
    container.moderationService,
    container.channelPublishingService,
    container.notificationService
  );
  const controller = new AdReportsController(service);
  const moderatorOnly = [requireAuth, requireRole(['admin', 'moderator'])];

  router.post('/', requireAuth, validateRequest({ body: createAdReportSchema }), controller.create);
  router.get(
    '/moderation',
    moderatorOnly,
    validateRequest({ query: adReportModerationQuerySchema }),
    controller.moderationList
  );
  router.post(
    '/:reportId/actions',
    moderatorOnly,
    validateRequest({ params: adReportIdParamSchema, body: resolveAdReportSchema }),
    controller.resolve
  );

  return router;
}
