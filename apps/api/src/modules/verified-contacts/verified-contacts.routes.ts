import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireFeature } from '../../shared/feature-flags/feature-guard.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { VerifiedContactsController } from './verified-contacts.controller.js';
import { attachResumeContactSchema, createDisputeSchema, verifyMiniAppContactSchema } from './verified-contacts.schemas.js';

export function createVerifiedContactsRouter(container: ApiContainer): Router {
  const router = Router();
  const controller = new VerifiedContactsController(container.verifiedContactsService);

  router.get('/mine', requireAuth, controller.mine);
  router.post(
    '/max-mini-app',
    requireFeature('CONTACT_VERIFICATION_ENABLED'),
    requireAuth,
    validateRequest({ body: verifyMiniAppContactSchema }),
    controller.verifyMiniApp
  );
  router.post(
    '/max-bot/request',
    requireFeature('BOT_CONTACT_FALLBACK_ENABLED'),
    requireAuth,
    controller.startBotFallback
  );
  router.post(
    '/resume-link',
    requireFeature('CONTACT_VERIFICATION_ENABLED'),
    requireAuth,
    validateRequest({ body: attachResumeContactSchema }),
    controller.attachResume
  );
  router.get('/resumes/:resumeAdId/contact', requireAuth, controller.getResumeContact);
  router.post('/resumes/:resumeAdId/connection-request', requireAuth, controller.sendConnectionRequest);
  router.post(
    '/entitlements/:entitlementId/disputes',
    requireFeature('CONTACT_DISPUTES_ENABLED'),
    requireAuth,
    validateRequest({ body: createDisputeSchema }),
    controller.openDispute
  );

  return router;
}
