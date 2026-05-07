import { Router } from 'express';
import { HealthController } from './health.controller.js';

export function createHealthRouter(): Router {
  const router = Router();
  const controller = new HealthController();

  router.get('/', controller.liveness);

  return router;
}
