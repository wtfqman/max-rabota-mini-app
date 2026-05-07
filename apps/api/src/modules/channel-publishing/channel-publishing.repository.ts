import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class ChannelPublishingRepository extends FoundationRepository {
  constructor(db: PrismaClient) {
    super('channel-publishing');
    void db;
  }
}
