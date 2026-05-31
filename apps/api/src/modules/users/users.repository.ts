import { UserRole, type Prisma, type PrismaClient, type User } from '@rabst24/db';
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
