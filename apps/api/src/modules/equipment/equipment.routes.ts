import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { adIdParamSchema } from '../../shared/http/params.schemas.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { EquipmentController } from './equipment.controller.js';
import { EquipmentRepository } from './equipment.repository.js';
import { createEquipmentSchema, equipmentListQuerySchema } from './equipment.schemas.js';
import { EquipmentService } from './equipment.service.js';

export function createEquipmentRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new EquipmentRepository(container.db);
  const service = new EquipmentService(repository, container.adService, container.moderationNotificationService);
  const controller = new EquipmentController(service);

  router.get('/status', controller.status);
  router.get('/', validateRequest({ query: equipmentListQuerySchema }), controller.list);
  router.post('/', requireAuth, validateRequest({ body: createEquipmentSchema }), controller.create);
  router.get('/:adId', validateRequest({ params: adIdParamSchema }), controller.details);

  return router;
}
