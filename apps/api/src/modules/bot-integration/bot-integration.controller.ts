import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { BotIntegrationService } from './bot-integration.service.js';

export class BotIntegrationController extends FoundationController {
  constructor(service: BotIntegrationService) {
    super(service);
  }
}
