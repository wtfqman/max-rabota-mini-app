import { type PrismaClient, type ProfileType, type UserTrustBadge } from '@rabst24/db';
import { AppError } from '@rabst24/shared';
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
    profileType?: ProfileType;
    companyName?: string | null;
    city?: string | null;
    districtText?: string | null;
    about?: string | null;
    avatarUrl?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    maxContact?: string | null;
    specialization?: string | null;
    experience?: string | null;
    companyInfo?: string | null;
    registrationDetails?: string | null;
    showPhone?: boolean;
    showEmail?: boolean;
    showWebsite?: boolean;
    showMaxContact?: boolean;
    allowResumePublicProfile?: boolean;
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

  async listTrustBadges(userId: string) {
    const user = await this.db.user.findFirst({
      where: {
        id: userId,
        deletedAt: null
      },
      select: {
        id: true,
        trustBadgeAssignments: {
          include: {
            assignedBy: {
              select: {
                id: true,
                displayName: true,
                maxUsername: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        },
        trustBadgeHistory: {
          include: {
            moderator: {
              select: {
                id: true,
                displayName: true,
                maxUsername: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }

  async updateTrustBadge(
    targetUserId: string,
    moderatorId: string,
    badge: UserTrustBadge,
    enabled: boolean,
    reason?: string | null
  ) {
    return this.db.$transaction(async (transaction) => {
      const target = await transaction.user.findFirst({
        where: {
          id: targetUserId,
          deletedAt: null
        },
        select: {
          id: true
        }
      });

      if (!target) {
        throw new AppError('User not found', 404);
      }

      const existing = await transaction.userTrustBadgeAssignment.findUnique({
        where: {
          userId_badge: {
            userId: targetUserId,
            badge
          }
        }
      });

      if (enabled) {
        await transaction.userTrustBadgeAssignment.upsert({
          where: {
            userId_badge: {
              userId: targetUserId,
              badge
            }
          },
          update: {
            assignedById: moderatorId,
            reason: normalizeText(reason)
          },
          create: {
            userId: targetUserId,
            badge,
            assignedById: moderatorId,
            reason: normalizeText(reason)
          }
        });
      } else if (existing) {
        await transaction.userTrustBadgeAssignment.delete({
          where: {
            userId_badge: {
              userId: targetUserId,
              badge
            }
          }
        });
      }

      await transaction.userTrustBadgeHistory.create({
        data: {
          userId: targetUserId,
          badge,
          action: enabled ? 'assigned' : 'removed',
          moderatorId,
          reason: normalizeText(reason)
        }
      });

      return transaction.user.findUniqueOrThrow({
        where: {
          id: targetUserId
        },
        select: {
          id: true,
          trustBadgeAssignments: {
            include: {
              assignedBy: {
                select: {
                  id: true,
                  displayName: true,
                  maxUsername: true
                }
              }
            },
            orderBy: {
              createdAt: 'asc'
            }
          },
          trustBadgeHistory: {
            include: {
              moderator: {
                select: {
                  id: true,
                  displayName: true,
                  maxUsername: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });
    });
  }
}

function normalizeText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
