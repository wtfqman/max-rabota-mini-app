import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireFeature } from '../../shared/feature-flags/feature-guard.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { JobApplicationsController } from './applications.controller.js';
import {
  createJobApplicationSchema,
  jobApplicationIdParamSchema,
  jobApplicationListQuerySchema,
  updateJobApplicationStatusSchema,
  vacancyApplicationParamSchema
} from './applications.schemas.js';

export function createApplicationsRouter(container: ApiContainer): Router {
  const router = Router();
  const controller = new JobApplicationsController(container.jobApplicationsService);

  router.use(requireFeature('APPLICATIONS_ENABLED'));
  router.use(requireAuth);

  router.get('/mine', validateRequest({ query: jobApplicationListQuerySchema }), controller.mine);
  router.post(
    '/vacancies/:vacancyAdId',
    validateRequest({ params: vacancyApplicationParamSchema, body: createJobApplicationSchema }),
    controller.createForVacancy
  );
  router.get(
    '/vacancies/:vacancyAdId',
    validateRequest({ params: vacancyApplicationParamSchema, query: jobApplicationListQuerySchema }),
    controller.forVacancy
  );
  router.patch(
    '/:applicationId/status',
    validateRequest({ params: jobApplicationIdParamSchema, body: updateJobApplicationStatusSchema }),
    controller.updateStatus
  );
  router.post('/:applicationId/withdraw', validateRequest({ params: jobApplicationIdParamSchema }), controller.withdraw);
  router.get('/:applicationId', validateRequest({ params: jobApplicationIdParamSchema }), controller.details);

  return router;
}
