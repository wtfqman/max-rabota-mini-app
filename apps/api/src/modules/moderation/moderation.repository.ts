import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class ModerationRepository extends FoundationRepository {
  constructor(db: PrismaClient) {
    super('moderation');
    void db;
  }
}
