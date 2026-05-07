import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class BotIntegrationRepository extends FoundationRepository {
  constructor(db: PrismaClient) {
    super('bot-integration');
    void db;
  }
}
