import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class AdsRepository extends FoundationRepository {
  constructor(db: PrismaClient) {
    super('ads');
    void db;
  }
}
