import { Router } from 'express';
import type { FeatureFlagKey } from '@rabst24/shared';
import { requireFeature } from '../../shared/feature-flags/feature-guard.js';
import { sendOk } from '../../shared/http/responses.js';

export function createReservedFeatureRouter(feature: FeatureFlagKey, moduleName: string): Router {
  const router = Router();

  router.use(requireFeature(feature));
  router.get('/status', (_request, response) => {
    sendOk(response, {
      module: moduleName,
      feature,
      status: 'reserved'
    });
  });

  return router;
}
