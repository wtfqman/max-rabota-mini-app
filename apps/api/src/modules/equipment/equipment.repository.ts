import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class EquipmentRepository extends FoundationRepository {
  constructor(db: PrismaClient) {
    super('equipment');
    void db;
  }
}
