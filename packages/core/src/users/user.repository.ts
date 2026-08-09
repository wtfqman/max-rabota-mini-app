import type { PrismaClient, User } from '@rabst24/db';

export interface UpsertMaxUserData {
  maxUserId: string;
  maxUsername?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  locale?: string | null;
  referrerId?: string | null;
}

export class UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsertFromMaxUser(data: UpsertMaxUserData): Promise<User> {
    const now = new Date();

    return this.db.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findUnique({
        where: {
          maxUserId: data.maxUserId
        },
        select: {
          id: true
        }
      });

      const user = await transaction.user.upsert({
        where: {
          maxUserId: data.maxUserId
        },
        update: {
          maxUsername: data.maxUsername,
          firstName: data.firstName,
          lastName: data.lastName,
          displayName: data.displayName,
          locale: data.locale,
          lastSeenAt: now
        },
        create: {
          maxUserId: data.maxUserId,
          maxUsername: data.maxUsername,
          firstName: data.firstName,
          lastName: data.lastName,
          displayName: data.displayName,
          locale: data.locale,
          startedAt: now,
          lastSeenAt: now
        }
      });

      if (!existingUser && data.referrerId && data.referrerId !== user.id) {
        const referrer = await transaction.user.findUnique({
          where: {
            id: data.referrerId
          },
          select: {
            id: true,
            deletedAt: true
          }
        });

        if (referrer && !referrer.deletedAt) {
          await transaction.referral.create({
            data: {
              referrerId: referrer.id,
              referredId: user.id
            }
          });
        }
      }

      await transaction.userProfile.upsert({
        where: {
          userId: user.id
        },
        update: {},
        create: {
          userId: user.id
        }
      });

      return user;
    });
  }

  async findById(userId: string): Promise<User | null> {
    return this.db.user.findUnique({
      where: {
        id: userId
      }
    });
  }

  async findByMaxUserId(maxUserId: string): Promise<User | null> {
    return this.db.user.findUnique({
      where: {
        maxUserId
      }
    });
  }
}
