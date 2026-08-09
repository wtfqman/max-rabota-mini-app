import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireFeature } from '../../shared/feature-flags/feature-guard.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { NotificationsController } from './notifications.controller.js';
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
  notificationPreferencesSchema
} from './notifications.schemas.js';

export function createNotificationsRouter(container: ApiContainer): Router {
  const router = Router();
  const controller = new NotificationsController(container.notificationService);

  router.use(requireFeature('USER_NOTIFICATIONS_ENABLED'));
  router.use(requireAuth);

  router.get('/', validateRequest({ query: notificationListQuerySchema }), controller.list);
  router.post('/read-all', controller.markAllRead);
  router.get('/preferences', controller.getPreferences);
  router.patch('/preferences', validateRequest({ body: notificationPreferencesSchema }), controller.updatePreferences);
  router.post('/:notificationId/read', validateRequest({ params: notificationIdParamSchema }), controller.markRead);

  return router;
}
