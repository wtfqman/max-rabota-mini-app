import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { requireFeature } from '../../shared/feature-flags/feature-guard.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { PromotionsController } from './promotions.controller.js';
import {
  createPromotionPurchaseSchema,
  promotionAdIdParamSchema,
  promotionProductTypeParamSchema,
  updatePromotionProductSchema
} from './promotions.schemas.js';

export function createPromotionsRouter(container: ApiContainer): Router {
  const router = Router();
  const controller = new PromotionsController(container.promotionsService);

  router.use(requireFeature('PROMOTIONS_ENABLED'));
  router.use(requireAuth);

  router.get('/ads/:adId/products', validateRequest({ params: promotionAdIdParamSchema }), controller.productsForAd);
  router.get('/ads/:adId/purchases', validateRequest({ params: promotionAdIdParamSchema }), controller.purchasesForAd);
  router.post(
    '/ads/:adId/purchases',
    validateRequest({ params: promotionAdIdParamSchema, body: createPromotionPurchaseSchema }),
    controller.createPurchase
  );

  router.get('/admin/products', requireRole(['admin']), controller.adminProducts);
  router.put(
    '/admin/products/:type',
    requireRole(['admin']),
    validateRequest({ params: promotionProductTypeParamSchema, body: updatePromotionProductSchema }),
    controller.updateAdminProduct
  );

  return router;
}
