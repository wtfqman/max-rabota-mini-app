import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class ReviewsRepository extends FoundationRepository {
  constructor(db: PrismaClient) {
    super('reviews');
    void db;
  }
}
