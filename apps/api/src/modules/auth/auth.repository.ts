import type { PrismaClient, UserProfile } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class AuthRepository extends FoundationRepository {
  constructor(private readonly db: PrismaClient) {
    super('auth');
  }

  async findProfileByUserId(userId: string): Promise<UserProfile | null> {
    return this.db.userProfile.findUnique({
      where: {
        userId
      }
    });
  }
}
