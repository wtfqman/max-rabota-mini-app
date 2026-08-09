import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesRepository } from './profiles.repository.js';
import { trustBadgeParamSchema, updateProfileSchema, updateTrustBadgeSchema } from './profiles.schemas.js';
import { ProfilesService } from './profiles.service.js';

export function createProfilesRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new ProfilesRepository(container.db);
  const service = new ProfilesService(repository);
  const controller = new ProfilesController(service);

  router.get('/status', controller.status);
  router.get('/me', requireAuth, controller.me);
  router.patch('/me', requireAuth, validateRequest({ body: updateProfileSchema }), controller.updateMe);
  router.get(
    '/admin/users/:userId/badges',
    requireAuth,
    requireRole(['admin']),
    validateRequest({ params: trustBadgeParamSchema.pick({ userId: true }) }),
    controller.listTrustBadges
  );
  router.put(
    '/admin/users/:userId/badges/:badge',
    requireAuth,
    requireRole(['admin']),
    validateRequest({ params: trustBadgeParamSchema, body: updateTrustBadgeSchema }),
    controller.updateTrustBadge
  );

  return router;
}
