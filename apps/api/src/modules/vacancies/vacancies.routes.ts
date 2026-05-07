import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { adIdParamSchema } from '../../shared/http/params.schemas.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { VacanciesController } from './vacancies.controller.js';
import { VacanciesRepository } from './vacancies.repository.js';
import { createVacancySchema, vacancyListQuerySchema } from './vacancies.schemas.js';
import { VacanciesService } from './vacancies.service.js';

export function createVacanciesRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new VacanciesRepository(container.db);
  const service = new VacanciesService(repository, container.adService);
  const controller = new VacanciesController(service);

  router.get('/status', controller.status);
  router.get('/', validateRequest({ query: vacancyListQuerySchema }), controller.list);
  router.post('/', requireAuth, validateRequest({ body: createVacancySchema }), controller.create);
  router.get('/:adId', validateRequest({ params: adIdParamSchema }), controller.details);

  return router;
}
