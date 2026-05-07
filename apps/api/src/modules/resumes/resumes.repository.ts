import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class ResumesRepository extends FoundationRepository {
  constructor(db: PrismaClient) {
    super('resumes');
    void db;
  }
}
