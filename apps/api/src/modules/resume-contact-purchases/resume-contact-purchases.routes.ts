import { Router } from 'express';
import { config } from '@rabst24/config';
import { optionalAuth, requireAuth } from '../../middlewares/auth.middleware.js';
import type { ApiContainer } from '../../app/container.js';
import { requireAnyFeature } from '../../shared/feature-flags/feature-guard.js';
import { adIdParamSchema } from '../../shared/http/params.schemas.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { ResumeContactPurchasesController } from './resume-contact-purchases.controller.js';
import { ResumeContactPurchasesService } from './resume-contact-purchases.service.js';

export function createResumeContactPurchasesRouter(container: ApiContainer): Router {
  const router = Router();
  const service = new ResumeContactPurchasesService(container.db, container.yooKassaClient, container.verifiedContactsService, {
    enabled: config.yookassa.enabled,
    currency: 'RUB',
    returnUrl: config.yookassa.returnUrl,
    testMode: config.yookassa.testMode
  }, container.adPaymentService);
  const controller = new ResumeContactPurchasesController(service);

  router.get(
    '/:adId',
    requireAnyFeature(['RESUME_CONTACT_PURCHASE_ENABLED', 'RESUME_CONNECTION_PURCHASE_ENABLED']),
    optionalAuth,
    validateRequest({ params: adIdParamSchema }),
    (request, _response, next) => {
      request.params.resumeAdId = request.params.adId;
      next();
    },
    controller.status
  );
  router.post(
    '/:adId',
    requireAnyFeature(['RESUME_CONTACT_PURCHASE_ENABLED', 'RESUME_CONNECTION_PURCHASE_ENABLED']),
    requireAuth,
    validateRequest({ params: adIdParamSchema }),
    (request, _response, next) => {
      request.params.resumeAdId = request.params.adId;
      next();
    },
    controller.create
  );

  return router;
}
