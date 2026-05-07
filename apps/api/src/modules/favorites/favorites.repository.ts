import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class FavoritesRepository extends FoundationRepository {
  constructor(db: PrismaClient) {
    super('favorites');
    void db;
  }
}
