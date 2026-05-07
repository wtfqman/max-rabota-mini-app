import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesRepository } from './profiles.repository.js';
import { updateProfileSchema } from './profiles.schemas.js';
import { ProfilesService } from './profiles.service.js';

export function createProfilesRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new ProfilesRepository(container.db);
  const service = new ProfilesService(repository);
  const controller = new ProfilesController(service);

  router.get('/status', controller.status);
  router.get('/me', requireAuth, controller.me);
  router.patch('/me', requireAuth, validateRequest({ body: updateProfileSchema }), controller.updateMe);

  return router;
}
