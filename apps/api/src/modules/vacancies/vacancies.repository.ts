import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class VacanciesRepository extends FoundationRepository {
  constructor(db: PrismaClient) {
    super('vacancies');
    void db;
  }
}
