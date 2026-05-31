import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { adIdParamSchema } from '../../shared/http/params.schemas.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { AdsController } from './ads.controller.js';
import { AdsRepository } from './ads.repository.js';
import {
  adListQuerySchema,
  createAdSchema,
  ownedAdsQuerySchema,
  publicationSettingsSchema,
  updateOwnedAdSchema
} from './ads.schemas.js';
import { AdsService } from './ads.service.js';

export function createAdsRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new AdsRepository(container.db);
  const service = new AdsService(
    repository,
    container.adService,
    container.channelPublishingService,
    container.moderationNotificationService
  );
  const controller = new AdsController(service);

  router.get('/status', controller.status);
  router.get('/my', requireAuth, validateRequest({ query: ownedAdsQuerySchema }), controller.my);
  router.get('/', validateRequest({ query: adListQuerySchema }), controller.list);
  router.post('/', validateRequest({ body: createAdSchema }), controller.reserved);
  router.get('/:adId', validateRequest({ params: adIdParamSchema }), controller.details);
  router.patch(
    '/:adId',
    requireAuth,
    validateRequest({ params: adIdParamSchema, body: updateOwnedAdSchema }),
    controller.updateMine
  );
  router.put(
    '/:adId/publication-settings',
    requireAuth,
    validateRequest({ params: adIdParamSchema, body: publicationSettingsSchema }),
    controller.updatePublicationSettings
  );
  router.post('/:adId/archive', requireAuth, validateRequest({ params: adIdParamSchema }), controller.archiveMine);
  router.post('/:adId/hide', requireAuth, validateRequest({ params: adIdParamSchema }), controller.hideMine);
  router.post('/:adId/unpublish', requireAuth, validateRequest({ params: adIdParamSchema }), controller.hideMine);
  router.post('/:adId/submit', requireAuth, validateRequest({ params: adIdParamSchema }), controller.resubmitMine);
  router.delete('/:adId', requireAuth, validateRequest({ params: adIdParamSchema }), controller.deleteMine);
  router.post('/:adId/photos', validateRequest({ params: adIdParamSchema }), controller.reserved);
  router.delete(
    '/:adId/photos/:photoId',
    validateRequest({
      params: adIdParamSchema.extend({
        photoId: adIdParamSchema.shape.adId
      })
    }),
    controller.reserved
  );

  return router;
}
