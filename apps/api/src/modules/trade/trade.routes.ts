import { Router } from 'express';
import type { AdTypeCode } from '@rabst24/shared';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { adIdParamSchema } from '../../shared/http/params.schemas.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { TradeController } from './trade.controller.js';
import { TradeRepository } from './trade.repository.js';
import { createTradeAdSchema, tradeListQuerySchema } from './trade.schemas.js';
import { TradeService } from './trade.service.js';

export function createMaterialsRouter(container: ApiContainer): Router {
  return createTradeRouter(container, {
    moduleName: 'materials',
    adType: 'material'
  });
}

export function createToolsRouter(container: ApiContainer): Router {
  return createTradeRouter(container, {
    moduleName: 'tools',
    adType: 'tool'
  });
}

function createTradeRouter(
  container: ApiContainer,
  options: { moduleName: string; adType: Extract<AdTypeCode, 'material' | 'tool'> }
): Router {
  const router = Router();
  const repository = new TradeRepository(container.db, options.moduleName);
  const service = new TradeService(repository, container.adService, options.adType, container.moderationNotificationService);
  const controller = new TradeController(service);

  router.get('/status', controller.status);
  router.get('/', validateRequest({ query: tradeListQuerySchema }), controller.list);
  router.post('/', requireAuth, validateRequest({ body: createTradeAdSchema }), controller.create);
  router.get('/:adId', validateRequest({ params: adIdParamSchema }), controller.details);

  return router;
}
