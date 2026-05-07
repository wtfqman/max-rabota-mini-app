import type { ModerationLog, Prisma, PrismaClient } from '@rabst24/db';

export class ModerationLogRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(data: Prisma.ModerationLogUncheckedCreateInput): Promise<ModerationLog> {
    return this.db.moderationLog.create({
      data
    });
  }

  async list(params: {
    adId?: string;
    moderatorId?: string;
    page: number;
    perPage: number;
  }): Promise<{ items: ModerationLog[]; total: number; page: number; perPage: number }> {
    const where: Prisma.ModerationLogWhereInput = {
      adId: params.adId,
      moderatorId: params.moderatorId
    };

    const [items, total] = await this.db.$transaction([
      this.db.moderationLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        },
        skip: (params.page - 1) * params.perPage,
        take: params.perPage
      }),
      this.db.moderationLog.count({ where })
    ]);

    return {
      items,
      total,
      page: params.page,
      perPage: params.perPage
    };
  }
}
