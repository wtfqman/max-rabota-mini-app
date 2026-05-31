import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsRepository } from './uploads.repository.js';
import { createUploadIntentSchema, uploadMediaSchema, uploadPhotoSchema } from './uploads.schemas.js';
import { UploadsService } from './uploads.service.js';

export function createUploadsRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new UploadsRepository(container.db);
  const service = new UploadsService(repository);
  const controller = new UploadsController(service);

  router.get('/status', controller.status);
  router.post('/intent', validateRequest({ body: createUploadIntentSchema }), controller.reserved);
  router.post('/media', requireAuth, validateRequest({ body: uploadMediaSchema }), controller.uploadMedia);
  router.post('/photos', requireAuth, validateRequest({ body: uploadPhotoSchema }), controller.uploadPhoto);

  return router;
}
