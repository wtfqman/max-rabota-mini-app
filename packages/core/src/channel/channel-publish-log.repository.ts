import {
  ChannelPublishStatus,
  type ChannelPublishLog,
  type Prisma,
  type PrismaClient
} from '@rabst24/db';

export class ChannelPublishLogRepository {
  constructor(private readonly db: PrismaClient) {}

  async createPending(data: {
    adId: string;
    channelId?: string | null;
    channelUrl?: string | null;
    maxChatId?: string | null;
    payload?: Prisma.InputJsonValue;
    publishedText?: string | null;
    mediaStrategy?: string | null;
    mediaAttachment?: Prisma.InputJsonValue | null;
  }): Promise<ChannelPublishLog> {
    return this.db.channelPublishLog.create({
      data: {
        adId: data.adId,
        channelId: data.channelId,
        channelUrl: data.channelUrl,
        maxChatId: data.maxChatId,
        payloadJson: data.payload ? JSON.stringify(data.payload) : undefined,
        publishedText: data.publishedText,
        mediaStrategy: data.mediaStrategy,
        mediaAttachmentJson: data.mediaAttachment ? JSON.stringify(data.mediaAttachment) : undefined,
        status: ChannelPublishStatus.PENDING
      }
    });
  }

  async markPublished(
    id: string,
    data: {
      maxMessageId?: string | null;
      maxMessageUrl?: string | null;
    }
  ): Promise<ChannelPublishLog> {
    return this.db.channelPublishLog.update({
      where: {
        id
      },
      data: {
        status: ChannelPublishStatus.PUBLISHED,
        maxMessageId: data.maxMessageId,
        maxMessageUrl: data.maxMessageUrl,
        publishedAt: new Date()
      }
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<ChannelPublishLog> {
    return this.db.channelPublishLog.update({
      where: {
        id
      },
      data: {
        status: ChannelPublishStatus.FAILED,
        errorMessage
      }
    });
  }

  async listPublishedForAd(adId: string): Promise<ChannelPublishLog[]> {
    return this.db.channelPublishLog.findMany({
      where: {
        adId,
        status: {
          in: [ChannelPublishStatus.PUBLISHED, ChannelPublishStatus.REMOVE_FAILED]
        },
        maxMessageId: {
          not: null
        }
      },
      orderBy: {
        publishedAt: 'desc'
      }
    });
  }

  async markRemoved(id: string): Promise<ChannelPublishLog> {
    return this.db.channelPublishLog.update({
      where: {
        id
      },
      data: {
        status: ChannelPublishStatus.REMOVED,
        removedAt: new Date(),
        removeErrorMessage: null
      }
    });
  }

  async markRemoveFailed(id: string, errorMessage: string): Promise<ChannelPublishLog> {
    return this.db.channelPublishLog.update({
      where: {
        id
      },
      data: {
        status: ChannelPublishStatus.REMOVE_FAILED,
        removeErrorMessage: errorMessage
      }
    });
  }

  async list(params: {
    adId?: string;
    status?: ChannelPublishStatus;
    page: number;
    perPage: number;
  }): Promise<{ items: ChannelPublishLog[]; total: number; page: number; perPage: number }> {
    const where: Prisma.ChannelPublishLogWhereInput = {
      adId: params.adId,
      status: params.status
    };

    const [items, total] = await this.db.$transaction([
      this.db.channelPublishLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        },
        skip: (params.page - 1) * params.perPage,
        take: params.perPage
      }),
      this.db.channelPublishLog.count({ where })
    ]);

    return {
      items,
      total,
      page: params.page,
      perPage: params.perPage
    };
  }
}
