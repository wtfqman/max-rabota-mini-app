import { FoundationService } from '../../shared/modules/module-status.js';
import type { BotIntegrationRepository } from './bot-integration.repository.js';

export class BotIntegrationService extends FoundationService {
  constructor(repository: BotIntegrationRepository) {
    super(repository);
  }
}
