import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { userIdParamSchema } from '../../shared/http/params.schemas.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { teamUserQuerySchema, updateCurrentUserSchema, updateUserRoleSchema } from './users.schemas.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

export function createUsersRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new UsersRepository(container.db);
  const service = new UsersService(repository);
  const controller = new UsersController(service);

  router.get('/status', controller.status);
  router.get('/me', requireAuth, controller.me);
  router.patch('/me', requireAuth, validateRequest({ body: updateCurrentUserSchema }), controller.updateMe);
  router.get('/team', requireAuth, requireRole(['admin']), validateRequest({ query: teamUserQuerySchema }), controller.team);
  router.patch(
    '/:userId/role',
    requireAuth,
    requireRole(['admin']),
    validateRequest({ params: userIdParamSchema, body: updateUserRoleSchema }),
    controller.updateRole
  );
  router.get('/:userId', validateRequest({ params: userIdParamSchema }), controller.reserved);

  return router;
}
