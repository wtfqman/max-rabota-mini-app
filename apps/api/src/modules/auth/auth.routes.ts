import { Router } from 'express';
import { config } from '@rabst24/config';
import type { ApiContainer } from '../../app/container.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { refreshSessionSchema, verifyMaxLaunchSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { MaxInitDataValidator } from './max-init-data.validator.js';
import { SessionTokenService } from './session-token.service.js';

export function createAuthRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new AuthRepository(container.db);
  const maxInitDataValidator = new MaxInitDataValidator({
    botToken: config.max.botToken,
    maxAgeSeconds: config.max.initDataMaxAgeSeconds
  });
  const sessionTokenService = new SessionTokenService({
    secret: config.session.secret,
    ttlSeconds: config.session.ttlSeconds
  });
  const service = new AuthService(
    repository,
    container.userService,
    maxInitDataValidator,
    sessionTokenService
  );
  const controller = new AuthController(service);

  router.get('/status', controller.status);
  router.post('/max/verify', validateRequest({ body: verifyMaxLaunchSchema }), controller.verifyMaxLaunch);
  if (!config.isProduction && config.devAuth.enabled) {
    router.post('/dev/session', controller.createDevSession);
  }
  router.post('/refresh', validateRequest({ body: refreshSessionSchema }), controller.reserved);
  router.post('/logout', controller.reserved);

  return router;
}
