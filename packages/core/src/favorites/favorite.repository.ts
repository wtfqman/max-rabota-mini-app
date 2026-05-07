import { AdStatus, type Favorite, type PrismaClient } from '@rabst24/db';
import { adWithDetailsInclude, type AdWithDetailsRecord } from '../ads/ad.repository.js';

export interface FavoriteWithAd {
  id: string;
  createdAt: Date;
  ad: AdWithDetailsRecord;
}

export class FavoriteRepository {
  constructor(private readonly db: PrismaClient) {}

  async add(userId: string, adId: string): Promise<Favorite> {
    return this.db.favorite.upsert({
      where: {
        userId_adId: {
          userId,
          adId
        }
      },
      update: {
        deletedAt: null
      },
      create: {
        userId,
        adId
      }
    });
  }

  async remove(userId: string, adId: string): Promise<void> {
    await this.db.favorite.updateMany({
      where: {
        userId,
        adId,
        deletedAt: null
      },
      data: {
        deletedAt: new Date()
      }
    });
  }

  async list(userId: string): Promise<FavoriteWithAd[]> {
    return this.db.favorite.findMany({
      where: {
        userId,
        deletedAt: null,
        ad: {
          status: {
            in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
          },
          deletedAt: null,
          hiddenAt: null,
          archivedAt: null
        }
      },
      include: {
        ad: {
          include: adWithDetailsInclude
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }
}
