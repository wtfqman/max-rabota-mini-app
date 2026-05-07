import type { PrismaClient } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class ProfilesRepository extends FoundationRepository {
  constructor(private readonly db: PrismaClient) {
    super('profiles');
  }

  async findMe(userId: string) {
    return this.db.userProfile.upsert({
      where: {
        userId
      },
      update: {},
      create: {
        userId
      }
    });
  }

  async updateMe(userId: string, data: {
    city?: string | null;
    districtText?: string | null;
    about?: string | null;
    avatarUrl?: string | null;
  }) {
    return this.db.userProfile.upsert({
      where: {
        userId
      },
      update: data,
      create: {
        userId,
        ...data
      }
    });
  }
}
