import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { BotIntegrationController } from './bot-integration.controller.js';
import { BotIntegrationRepository } from './bot-integration.repository.js';
import { BotIntegrationService } from './bot-integration.service.js';

export function createBotIntegrationRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new BotIntegrationRepository(container.db);
  const service = new BotIntegrationService(repository);
  const controller = new BotIntegrationController(service);

  router.get('/status', controller.status);
  router.get('/start-message-preview', controller.reserved);

  return router;
}
