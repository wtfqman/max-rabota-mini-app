import { Router } from 'express';
import { FeaturesController } from './features.controller.js';

export function createFeaturesRouter(): Router {
  const router = Router();
  const controller = new FeaturesController();

  router.get('/', controller.list);

  return router;
}
