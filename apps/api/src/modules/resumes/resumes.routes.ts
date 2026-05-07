import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { adIdParamSchema } from '../../shared/http/params.schemas.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesRepository } from './resumes.repository.js';
import { createResumeSchema, resumeListQuerySchema } from './resumes.schemas.js';
import { ResumesService } from './resumes.service.js';

export function createResumesRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new ResumesRepository(container.db);
  const service = new ResumesService(repository, container.adService);
  const controller = new ResumesController(service);

  router.get('/status', controller.status);
  router.get('/', validateRequest({ query: resumeListQuerySchema }), controller.list);
  router.post('/', requireAuth, validateRequest({ body: createResumeSchema }), controller.create);
  router.get('/:adId', validateRequest({ params: adIdParamSchema }), controller.details);

  return router;
}
