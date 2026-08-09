import {
  ExternalPublicationPlatform,
  ExternalPublicationSourcePlatform,
  ExternalPublicationStatus,
  TelegramAccountStatus,
  TelegramLinkTokenStatus,
  TelegramTargetStatus,
  TelegramTargetType,
  type Prisma,
  type PrismaClient,
  type TelegramAccount,
  type TelegramTarget
} from '@rabst24/db';
import { EXPECTED_TELEGRAM_TARGETS, normalizeTelegramUsername } from './targets.js';

export interface TelegramTargetPermissionState {
  title?: string | null;
  chatId?: string | number | null;
  type?: TelegramTargetType;
  status: TelegramTargetStatus;
  botIsMember: boolean;
  botIsAdmin: boolean;
  canPostMessages: boolean;
  canEditMessages: boolean;
  canDeleteMessages: boolean;
  canSendMediaMessages: boolean;
  canManageTopics: boolean;
  lastError?: string | null;
}

export class TelegramAccountRepository {
  constructor(private readonly db: PrismaClient) {}

  upsertFromTelegramUser(user: {
    id: number | bigint;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    language_code?: string | null;
  }): Promise<TelegramAccount> {
    const telegramUserId = String(user.id);

    return this.db.telegramAccount.upsert({
      where: {
        telegramUserId
      },
      update: {
        username: user.username ?? null,
        firstName: user.first_name ?? null,
        lastName: user.last_name ?? null,
        languageCode: user.language_code ?? null,
        status: TelegramAccountStatus.ACTIVE
      },
      create: {
        telegramUserId,
        username: user.username ?? null,
        firstName: user.first_name ?? null,
        lastName: user.last_name ?? null,
        languageCode: user.language_code ?? null
      }
    });
  }

  findByTelegramUserId(telegramUserId: string | number | bigint): Promise<TelegramAccount | null> {
    return this.db.telegramAccount.findUnique({
      where: {
        telegramUserId: String(telegramUserId)
      }
    });
  }

  linkToUser(telegramAccountId: string, userId: string): Promise<TelegramAccount> {
    return this.db.telegramAccount.update({
      where: {
        id: telegramAccountId
      },
      data: {
        userId,
        linkedAt: new Date(),
        status: TelegramAccountStatus.ACTIVE
      }
    });
  }
}

export class TelegramTargetRepository {
  constructor(private readonly db: PrismaClient) {}

  async ensureExpectedTargets(): Promise<{ created: number; total: number }> {
    let created = 0;

    for (const target of EXPECTED_TELEGRAM_TARGETS) {
      const username = normalizeTelegramUsername(target.username);
      const existing = await this.db.telegramTarget.findUnique({
        where: {
          username
        },
        select: {
          id: true
        }
      });

      if (!existing) {
        created += 1;
      }

      await this.db.telegramTarget.upsert({
        where: {
          username
        },
        update: {
          type: target.type
        },
        create: {
          username,
          type: target.type,
          enabled: false,
          publishEnabled: false,
          editEnabled: false,
          deleteEnabled: false,
          testTarget: false,
          status: TelegramTargetStatus.DISABLED
        }
      });
    }

    return {
      created,
      total: EXPECTED_TELEGRAM_TARGETS.length
    };
  }

  list(): Promise<TelegramTarget[]> {
    return this.db.telegramTarget.findMany({
      orderBy: [
        {
          testTarget: 'desc'
        },
        {
          type: 'asc'
        },
        {
          username: 'asc'
        }
      ]
    });
  }

  findById(id: string): Promise<TelegramTarget | null> {
    return this.db.telegramTarget.findUnique({
      where: {
        id
      }
    });
  }

  findByChatId(chatId: string | number | bigint): Promise<TelegramTarget | null> {
    return this.db.telegramTarget.findUnique({
      where: {
        chatId: String(chatId)
      }
    });
  }

  findByUsername(username: string): Promise<TelegramTarget | null> {
    return this.db.telegramTarget.findUnique({
      where: {
        username: normalizeTelegramUsername(username)
      }
    });
  }

  async registerChat(input: {
    username?: string | null;
    chatId: string | number | bigint;
    messageThreadId?: string | number | null;
    title?: string | null;
    type: TelegramTargetType;
    testTarget?: boolean;
  }): Promise<TelegramTarget> {
    const chatId = String(input.chatId);
    const messageThreadId = input.messageThreadId === undefined || input.messageThreadId === null
      ? null
      : String(input.messageThreadId);
    const normalizedUsername = input.username ? normalizeTelegramUsername(input.username) : null;
    const existing = await this.db.telegramTarget.findFirst({
      where: {
        OR: [
          {
            chatId
          },
          ...(normalizedUsername ? [{ username: normalizedUsername }] : [])
        ]
      }
    });

    const data = {
      chatId,
      messageThreadId,
      title: input.title ?? undefined,
      type: input.type,
      testTarget: input.testTarget ?? true,
      status: TelegramTargetStatus.TESTING
    } satisfies Prisma.TelegramTargetUpdateInput;

    if (existing) {
      return this.db.telegramTarget.update({
        where: {
          id: existing.id
        },
        data
      });
    }

    return this.db.telegramTarget.create({
      data: {
        username: normalizedUsername ?? `chat_${chatId}`,
        chatId,
        messageThreadId,
        title: input.title ?? null,
        type: input.type,
        testTarget: input.testTarget ?? true,
        enabled: false,
        publishEnabled: false,
        editEnabled: false,
        deleteEnabled: false,
        status: TelegramTargetStatus.TESTING
      }
    });
  }

  updatePermissions(targetId: string, state: TelegramTargetPermissionState): Promise<TelegramTarget> {
    const publishReady = state.status === TelegramTargetStatus.READY;

    return this.db.telegramTarget.update({
      where: {
        id: targetId
      },
      data: {
        chatId: state.chatId === undefined ? undefined : state.chatId === null ? null : String(state.chatId),
        title: state.title === undefined ? undefined : state.title,
        type: state.type,
        status: state.status,
        botIsMember: state.botIsMember,
        botIsAdmin: state.botIsAdmin,
        canPostMessages: state.canPostMessages,
        canEditMessages: state.canEditMessages,
        canDeleteMessages: state.canDeleteMessages,
        canSendMediaMessages: state.canSendMediaMessages,
        canManageTopics: state.canManageTopics,
        publishEnabled: publishReady,
        editEnabled: state.canEditMessages,
        deleteEnabled: state.canDeleteMessages,
        enabled: publishReady,
        lastPermissionCheckAt: new Date(),
        lastError: state.lastError ?? null
      }
    });
  }

  setEnabled(targetId: string, enabled: boolean): Promise<TelegramTarget> {
    return this.db.telegramTarget.update({
      where: {
        id: targetId
      },
      data: {
        enabled,
        publishEnabled: enabled,
        status: enabled ? TelegramTargetStatus.TESTING : TelegramTargetStatus.DISABLED
      }
    });
  }

  markPublishSuccess(targetId: string): Promise<TelegramTarget> {
    return this.db.telegramTarget.update({
      where: {
        id: targetId
      },
      data: {
        lastSuccessfulPublishAt: new Date(),
        lastError: null
      }
    });
  }

  markError(targetId: string, message: string, status = TelegramTargetStatus.ERROR): Promise<TelegramTarget> {
    return this.db.telegramTarget.update({
      where: {
        id: targetId
      },
      data: {
        status,
        enabled: false,
        publishEnabled: false,
        lastError: message.slice(0, 1000)
      }
    });
  }

  listPublishable(testMode: boolean): Promise<TelegramTarget[]> {
    return this.db.telegramTarget.findMany({
      where: {
        enabled: true,
        publishEnabled: true,
        chatId: {
          not: null
        },
        ...(testMode ? { testTarget: true } : {})
      },
      orderBy: {
        username: 'asc'
      }
    });
  }
}

export class ExternalPublicationRepository {
  constructor(private readonly db: PrismaClient) {}

  async createPending(input: {
    adId: string;
    targetId: string;
    platform?: ExternalPublicationPlatform;
    sourcePlatform: ExternalPublicationSourcePlatform;
    correlationId: string;
    publicationVersion?: number;
  }) {
    const platform = input.platform ?? ExternalPublicationPlatform.TELEGRAM;
    const publicationVersion = input.publicationVersion ?? 1;

    return this.db.externalPublication.upsert({
      where: {
        adId_platform_targetId_publicationVersion: {
          adId: input.adId,
          platform,
          targetId: input.targetId,
          publicationVersion
        }
      },
      update: {},
      create: {
        adId: input.adId,
        platform,
        targetId: input.targetId,
        sourcePlatform: input.sourcePlatform,
        correlationId: input.correlationId,
        publicationVersion,
        status: ExternalPublicationStatus.PENDING
      }
    });
  }

  markPublished(input: {
    id: string;
    externalChatId: string;
    externalMessageId: string;
    externalMediaGroupId?: string | null;
    externalUrl?: string | null;
  }) {
    return this.db.externalPublication.update({
      where: {
        id: input.id
      },
      data: {
        externalChatId: input.externalChatId,
        externalMessageId: input.externalMessageId,
        externalMediaGroupId: input.externalMediaGroupId ?? null,
        externalUrl: input.externalUrl ?? null,
        status: ExternalPublicationStatus.PUBLISHED,
        lastError: null,
        publishedAt: new Date()
      }
    });
  }

  markEdited(id: string) {
    return this.db.externalPublication.update({
      where: {
        id
      },
      data: {
        status: ExternalPublicationStatus.EDITED,
        lastError: null,
        editedAt: new Date()
      }
    });
  }

  markDeleted(id: string) {
    return this.db.externalPublication.update({
      where: {
        id
      },
      data: {
        status: ExternalPublicationStatus.DELETED,
        lastError: null,
        deletedAt: new Date()
      }
    });
  }

  markFailed(id: string, message: string) {
    return this.db.externalPublication.update({
      where: {
        id
      },
      data: {
        status: ExternalPublicationStatus.FAILED,
        lastError: message.slice(0, 1000)
      }
    });
  }

  listActiveForAd(adId: string, platform = ExternalPublicationPlatform.TELEGRAM) {
    return this.db.externalPublication.findMany({
      where: {
        adId,
        platform,
        status: {
          in: [ExternalPublicationStatus.PUBLISHED, ExternalPublicationStatus.EDITED]
        }
      },
      include: {
        telegramTarget: true
      }
    });
  }
}

export class TelegramLinkTokenRepository {
  constructor(private readonly db: PrismaClient) {}

  create(input: { telegramAccountId: string; codeHash: string; expiresAt: Date }) {
    return this.db.telegramLinkToken.create({
      data: {
        telegramAccountId: input.telegramAccountId,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt
      }
    });
  }

  findPendingByCodeHash(codeHash: string) {
    return this.db.telegramLinkToken.findFirst({
      where: {
        codeHash,
        status: TelegramLinkTokenStatus.PENDING,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        telegramAccount: true
      }
    });
  }

  consume(id: string) {
    return this.db.telegramLinkToken.update({
      where: {
        id
      },
      data: {
        status: TelegramLinkTokenStatus.CONSUMED,
        consumedAt: new Date()
      }
    });
  }
}
