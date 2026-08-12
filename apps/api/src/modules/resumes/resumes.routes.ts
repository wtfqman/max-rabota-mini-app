import { Router } from 'express';
import { config } from '@rabst24/config';
import type { ApiContainer } from '../../app/container.js';
import { optionalAuth, requireAuth } from '../../middlewares/auth.middleware.js';
import { adIdParamSchema } from '../../shared/http/params.schemas.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesRepository } from './resumes.repository.js';
import { createResumeSchema, resumeListQuerySchema } from './resumes.schemas.js';
import { ResumesService } from './resumes.service.js';
import { ResumeContactPurchasesService } from '../resume-contact-purchases/resume-contact-purchases.service.js';

export function createResumesRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new ResumesRepository(container.db);
  const service = new ResumesService(
    repository,
    container.adService,
    container.moderationNotificationService,
    container.notificationService,
    container.verifiedContactsService
  );
  const contactPurchasesService = new ResumeContactPurchasesService(container.db, container.yooKassaClient, container.verifiedContactsService, {
    enabled: config.yookassa.enabled,
    currency: 'RUB',
    returnUrl: config.yookassa.returnUrl,
    testMode: config.yookassa.testMode
  }, container.adPaymentService);
  const controller = new ResumesController(service, contactPurchasesService);

  router.get('/status', controller.status);
  router.get('/', validateRequest({ query: resumeListQuerySchema }), controller.list);
  router.post('/', requireAuth, validateRequest({ body: createResumeSchema }), controller.create);
  router.get('/:adId', optionalAuth, validateRequest({ params: adIdParamSchema }), controller.details);

  return router;
}
