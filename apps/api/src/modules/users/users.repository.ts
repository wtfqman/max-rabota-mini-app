import {
  adWithDetailsInclude,
  buildPublicAdFreshnessFilters,
  getAdPublicationSettings,
  mergeAdPublicationSettings
} from '@rabst24/core';
import { AdStatus, ModerationAction, UserRole, UserStatus, type Prisma, type PrismaClient, type User } from '@rabst24/db';
import { AppError } from '@rabst24/shared';
import { FoundationRepository } from '../../shared/modules/module-status.js';

export interface TeamUserQuery {
  q?: string;
  role?: 'user' | 'moderator' | 'admin';
}

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
        trustBadgeAssignments: true,
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

  async findPublicProfile(userId: string) {
    const user = await this.db.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        deletedAt: null
      },
      include: {
        profile: true,
        trustBadgeAssignments: {
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    if (!user) {
      return null;
    }

    const publicAdWhere: Prisma.AdWhereInput = {
      ownerId: userId,
      status: {
        in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
      },
      deletedAt: null,
      hiddenAt: null,
      archivedAt: null,
      isTest: false,
      AND: buildPublicAdFreshnessFilters()
    };

    const [activeAds, adsTotal, reviews, reviewSummary] = await this.db.$transaction([
      this.db.ad.findMany({
        where: publicAdWhere,
        include: adWithDetailsInclude,
        orderBy: [
          {
            publishedAt: 'desc'
          },
          {
            createdAt: 'desc'
          }
        ],
        take: 12
      }),
      this.db.ad.count({
        where: publicAdWhere
      }),
      this.db.review.findMany({
        where: {
          subjectId: userId,
          status: 'PUBLISHED',
          deletedAt: null
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
              maxUsername: true
            }
          },
          ad: {
            select: {
              id: true,
              title: true,
              type: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 5
      }),
      this.db.review.aggregate({
        where: {
          subjectId: userId,
          status: 'PUBLISHED',
          deletedAt: null
        },
        _avg: {
          rating: true
        },
        _count: {
          _all: true
        }
      })
    ]);

    return {
      user,
      activeAds,
      adsTotal,
      reviews,
      reviewSummary
    };
  }

  async listTeamUsers(query: TeamUserQuery) {
    const where = this.buildTeamWhere(query);

    return this.db.user.findMany({
      where,
      select: {
        id: true,
        maxUserId: true,
        maxUsername: true,
        firstName: true,
        lastName: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        lastSeenAt: true,
        _count: {
          select: {
            ads: true
          }
        }
      },
      orderBy: [
        {
          role: 'desc'
        },
        {
          lastSeenAt: 'desc'
        },
        {
          createdAt: 'desc'
        }
      ],
      take: 50
    });
  }

  async updateUserRole(actorId: string, targetUserId: string, role: UserRole): Promise<{ user: User; previousRole: UserRole }> {
    return this.db.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: {
          id: targetUserId
        }
      });

      if (!target) {
        throw new AppError('User not found', 404);
      }

      if (target.id === actorId && target.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
        throw new AppError('Cannot remove your own admin role', 400);
      }

      if (target.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
        const admins = await transaction.user.count({
          where: {
            role: UserRole.ADMIN,
            deletedAt: null
          }
        });

        if (admins <= 1) {
          throw new AppError('Cannot remove the last admin', 400);
        }
      }

      const user = await transaction.user.update({
        where: {
          id: targetUserId
        },
        data: {
          role
        }
      });

      return {
        user,
        previousRole: target.role
      };
    });
  }

  async updateUserStatus(
    actorId: string,
    targetUserId: string,
    status: UserStatus
  ): Promise<{ user: User; previousStatus: UserStatus; hiddenAdIds: string[] }> {
    return this.db.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: {
          id: targetUserId
        }
      });

      if (!target) {
        throw new AppError('User not found', 404);
      }

      if (target.id === actorId && status !== UserStatus.ACTIVE) {
        throw new AppError('Cannot block your own account', 400);
      }

      if (target.role === UserRole.ADMIN && status !== UserStatus.ACTIVE) {
        const activeAdmins = await transaction.user.count({
          where: {
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            deletedAt: null
          }
        });

        if (activeAdmins <= 1) {
          throw new AppError('Cannot block the last active admin', 400);
        }
      }

      const user = await transaction.user.update({
        where: {
          id: targetUserId
        },
        data: {
          status
        }
      });
      const hiddenAdIds =
        status === UserStatus.BLOCKED
          ? await this.hidePublishableAdsForBlockedUser(transaction, actorId, targetUserId)
          : [];

      return {
        user,
        previousStatus: target.status,
        hiddenAdIds
      };
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

  async getReferralStats(userId: string) {
    const [referredTotal, rewardedTotal, bonusPublications] = await this.db.$transaction([
      this.db.referral.count({
        where: {
          referrerId: userId
        }
      }),
      this.db.referral.count({
        where: {
          referrerId: userId,
          rewardedAt: {
            not: null
          }
        }
      }),
      this.db.vacancyPublicationGrant.aggregate({
        where: {
          userId,
          source: 'REFERRAL'
        },
        _sum: {
          publications: true
        }
      })
    ]);

    return {
      code: `ref_${userId}`,
      referredTotal,
      rewardedTotal,
      bonusPublications: bonusPublications._sum.publications ?? 0
    };
  }

  private buildTeamWhere(query: TeamUserQuery): Prisma.UserWhereInput {
    const normalizedQuery = query.q?.trim().replace(/^@/, '');

    return {
      deletedAt: null,
      role: query.role ? mapRole(query.role) : undefined,
      OR: normalizedQuery
        ? [
            { id: { contains: normalizedQuery } },
            { maxUserId: { contains: normalizedQuery } },
            { maxUsername: { contains: normalizedQuery } },
            { firstName: { contains: normalizedQuery } },
            { lastName: { contains: normalizedQuery } },
            { displayName: { contains: normalizedQuery } }
          ]
        : undefined
    };
  }

  private async hidePublishableAdsForBlockedUser(
    transaction: Prisma.TransactionClient,
    actorId: string,
    targetUserId: string
  ): Promise<string[]> {
    const ads = await transaction.ad.findMany({
      where: {
        ownerId: targetUserId,
        deletedAt: null,
        status: {
          in: [AdStatus.PENDING_MODERATION, AdStatus.APPROVED, AdStatus.PUBLISHED]
        }
      },
      select: {
        id: true,
        status: true,
        metadataJson: true
      }
    });

    if (ads.length === 0) {
      return [];
    }

    const now = new Date();

    for (const ad of ads) {
      const settings = getAdPublicationSettings(ad.metadataJson);

      await transaction.ad.update({
        where: {
          id: ad.id
        },
        data: {
          status: AdStatus.HIDDEN,
          hiddenAt: now,
          archivedAt: null,
          deletedAt: null,
          metadataJson: settings?.autoRepeat
            ? mergeAdPublicationSettings(ad.metadataJson, {
                ...settings,
                autoRepeat: false
              })
            : undefined
        }
      });
    }

    await transaction.moderationLog.createMany({
      data: ads.map((ad) => ({
        adId: ad.id,
        moderatorId: actorId,
        action: ModerationAction.HIDDEN,
        statusFrom: ad.status,
        statusTo: AdStatus.HIDDEN,
        reason: 'Пользователь заблокирован администратором'
      }))
    });

    return ads.map((ad) => ad.id);
  }
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function mapRole(role: 'user' | 'moderator' | 'admin'): UserRole {
  if (role === 'admin') {
    return UserRole.ADMIN;
  }

  if (role === 'moderator') {
    return UserRole.MODERATOR;
  }

  return UserRole.USER;
}

export function mapStatus(status: 'active' | 'blocked'): UserStatus {
  return status === 'blocked' ? UserStatus.BLOCKED : UserStatus.ACTIVE;
}
