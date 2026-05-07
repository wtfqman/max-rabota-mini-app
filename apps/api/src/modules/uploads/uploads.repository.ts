import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class UploadsRepository extends FoundationRepository {
  constructor(db: PrismaClient) {
    super('uploads');
    void db;
  }
}
