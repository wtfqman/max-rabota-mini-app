import type { PrismaClient, User } from '@rabst24/db';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export class UsersRepository extends FoundationRepository {
  constructor(private readonly db: PrismaClient) {
    super('users');
  }

  async findMe(userId: string) {
    return this.db.user.findUnique({
      where: {
        id: userId
      },
      include: {
        profile: true,
        _count: {
          select: {
            ads: true,
            reviewsReceived: true,
            favorites: true
          }
        }
      }
    });
  }

  async updateMe(userId: string, data: { displayName?: string }): Promise<User> {
    return this.db.user.update({
      where: {
        id: userId
      },
      data
    });
  }

  async getAdStats(userId: string) {
    const ads = await this.db.ad.findMany({
      where: {
        ownerId: userId,
        deletedAt: null
      },
      select: {
        status: true,
        type: true
      }
    });

    return {
      byStatus: countBy(ads.map((ad) => ad.status.toLowerCase())),
      byType: countBy(ads.map((ad) => ad.type.toLowerCase()))
    } satisfies {
      byStatus: Record<string, number>;
      byType: Record<string, number>;
    };
  }
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {});
}
