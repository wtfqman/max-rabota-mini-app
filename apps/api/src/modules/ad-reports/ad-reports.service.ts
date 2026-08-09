import {
  AdReportStatus,
  AdStatus,
  ModerationAction,
  UserStatus,
  type Prisma,
  type PrismaClient
} from '@rabst24/db';
import { AppError } from '@rabst24/shared';
import type { ModerationService as CoreModerationService } from '@rabst24/core';
import type { ChannelPublishingService } from '@rabst24/core';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { CreateAdReportDto, AdReportModerationQuery, ResolveAdReportDto } from './ad-reports.schemas.js';

const OPEN_REPORT_STATUSES = [AdReportStatus.OPEN, AdReportStatus.IN_REVIEW] as const;

type ReportWithContext = Prisma.AdReportGetPayload<{
  include: ReturnType<typeof adReportInclude>;
}>;

export class AdReportsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly moderationService: CoreModerationService,
    private readonly channelPublishingService: ChannelPublishingService,
    private readonly notificationService?: NotificationService
  ) {}

  async createReport(reporterUserId: string, dto: CreateAdReportDto) {
    const [reporter, ad] = await Promise.all([
      this.db.user.findFirst({
        where: {
          id: reporterUserId,
          status: UserStatus.ACTIVE,
          deletedAt: null
        },
        select: {
          id: true
        }
      }),
      this.db.ad.findFirst({
        where: {
          id: dto.adId,
          deletedAt: null,
          status: {
            not: AdStatus.DELETED
          }
        },
        select: {
          id: true,
          ownerId: true,
          title: true
        }
      })
    ]);

    if (!reporter) {
      throw new AppError('Reporter is blocked or deleted', 403, {
        code: 'REPORTER_NOT_ACTIVE'
      });
    }

    if (!ad) {
      throw new AppError('Ad not found', 404, {
        code: 'AD_NOT_FOUND',
        adId: dto.adId
      });
    }

    if (ad.ownerId === reporterUserId) {
      throw new AppError('Cannot report your own ad', 409, {
        code: 'SELF_REPORT_BLOCKED',
        adId: ad.id
      });
    }

    const duplicate = await this.db.adReport.findFirst({
      where: {
        reporterUserId,
        adId: ad.id,
        status: {
          in: [...OPEN_REPORT_STATUSES]
        }
      },
      select: {
        id: true,
        status: true
      }
    });

    if (duplicate) {
      return {
        report: {
          id: duplicate.id,
          status: duplicate.status,
          duplicate: true
        }
      };
    }

    const report = await this.db.$transaction(async (tx) => {
      const created = await tx.adReport.create({
        data: {
          reporterUserId,
          adId: ad.id,
          reportedUserId: ad.ownerId,
          reason: dto.reason,
          comment: normalizeNullableText(dto.comment),
          evidenceJson: dto.evidence ? JSON.stringify(dto.evidence) : null,
          status: AdReportStatus.OPEN
        }
      });

      await tx.adReportStatusHistory.create({
        data: {
          reportId: created.id,
          action: 'created',
          statusFrom: null,
          statusTo: AdReportStatus.OPEN,
          reason: dto.reason
        }
      });

      return created;
    });

    return {
      report: {
        id: report.id,
        status: report.status,
        duplicate: false
      }
    };
  }

  async listForModeration(query: AdReportModerationQuery) {
    const where: Prisma.AdReportWhereInput = {
      status: query.status
    };

    const [items, total] = await this.db.$transaction([
      this.db.adReport.findMany({
        where,
        include: adReportInclude(),
        orderBy: {
          createdAt: 'desc'
        },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage
      }),
      this.db.adReport.count({ where })
    ]);

    return {
      items: items.map((report) => this.toModerationDto(report)),
      page: query.page,
      perPage: query.perPage,
      total
    };
  }

  async resolveReport(moderatorId: string, reportId: string, dto: ResolveAdReportDto) {
    const report = await this.getReportOrThrow(reportId);

    if (report.status === AdReportStatus.RESOLVED_ACTION_TAKEN || report.status === AdReportStatus.RESOLVED_NO_VIOLATION || report.status === AdReportStatus.CANCELLED) {
      throw new AppError('Report is already resolved', 409, {
        code: 'REPORT_ALREADY_RESOLVED',
        reportId
      });
    }

    const result = await this.applyModeratorAction(moderatorId, report, dto);
    const nextStatus = dto.action === 'no_violation' ? AdReportStatus.RESOLVED_NO_VIOLATION : AdReportStatus.RESOLVED_ACTION_TAKEN;

    const updated = await this.db.$transaction(async (tx) => {
      const resolved = await tx.adReport.update({
        where: {
          id: report.id
        },
        data: {
          status: nextStatus,
          moderatorId,
          resolution: dto.resolution,
          resolvedAt: new Date()
        },
        include: adReportInclude()
      });

      await tx.adReportStatusHistory.create({
        data: {
          reportId: report.id,
          moderatorId,
          action: dto.action,
          statusFrom: report.status,
          statusTo: nextStatus,
          adStatusFrom: result.adStatusFrom,
          adStatusTo: result.adStatusTo,
          userStatusFrom: result.userStatusFrom,
          userStatusTo: result.userStatusTo,
          reason: dto.resolution
        }
      });

      await tx.moderationLog.create({
        data: {
          adId: report.adId,
          moderatorId,
          action: this.toModerationAction(dto.action),
          statusFrom: result.adStatusFrom ?? report.ad.status,
          statusTo: result.adStatusTo ?? report.ad.status,
          reason: dto.resolution,
          metadataJson: JSON.stringify({
            reportId: report.id,
            reportAction: dto.action,
            reportedUserId: report.reportedUserId,
            userStatusFrom: result.userStatusFrom ?? null,
            userStatusTo: result.userStatusTo ?? null
          })
        }
      });

      return resolved;
    });

    await this.notifyAuthor(updated, dto.action, dto.resolution);

    return this.toModerationDto(updated);
  }

  private async applyModeratorAction(
    moderatorId: string,
    report: ReportWithContext,
    dto: ResolveAdReportDto
  ): Promise<{
    adStatusFrom: AdStatus | null;
    adStatusTo: AdStatus | null;
    userStatusFrom: UserStatus | null;
    userStatusTo: UserStatus | null;
  }> {
    const adStatusFrom = report.ad.status;
    let adStatusTo: AdStatus | null = report.ad.status;
    let userStatusFrom: UserStatus | null = null;
    let userStatusTo: UserStatus | null = null;

    if (dto.action === 'hide_ad') {
      await this.moderationService.hideAd(report.adId, moderatorId, dto.resolution);
      await this.channelPublishingService.removeAdPublications(report.adId);
      adStatusTo = AdStatus.HIDDEN;
    } else if (dto.action === 'send_to_moderation') {
      await this.moderationService.submitForModeration(report.adId);
      await this.channelPublishingService.removeAdPublications(report.adId);
      adStatusTo = AdStatus.PENDING_MODERATION;
    } else if (dto.action === 'delete_ad') {
      await this.moderationService.deleteAd(report.adId, moderatorId, dto.resolution);
      await this.channelPublishingService.removeAdPublications(report.adId);
      adStatusTo = AdStatus.DELETED;
    } else if (dto.action === 'warn_user') {
      await this.notifyWarning(report, dto.resolution);
    } else if (dto.action === 'temp_block_user' || dto.action === 'block_user') {
      const updated = await this.blockReportedUser(report.reportedUserId, dto.action === 'temp_block_user' ? dto.tempBlockDays ?? 7 : null);
      userStatusFrom = updated.previousStatus;
      userStatusTo = updated.status;
    } else {
      adStatusTo = adStatusFrom;
    }

    return {
      adStatusFrom,
      adStatusTo,
      userStatusFrom,
      userStatusTo
    };
  }

  private async blockReportedUser(userId: string, days: number | null): Promise<{ previousStatus: UserStatus; status: UserStatus }> {
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: {
          id: userId
        },
        select: {
          id: true,
          status: true,
          role: true
        }
      });

      if (!user) {
        throw new AppError('Reported user not found', 404, {
          code: 'REPORTED_USER_NOT_FOUND',
          userId
        });
      }

      const blockedUntil = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
      const updated = await tx.user.update({
        where: {
          id: userId
        },
        data: {
          status: UserStatus.BLOCKED,
          blockedUntil
        },
        select: {
          status: true
        }
      });

      await tx.ad.updateMany({
        where: {
          ownerId: userId,
          status: {
            in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
          },
          deletedAt: null
        },
        data: {
          status: AdStatus.HIDDEN,
          hiddenAt: new Date()
        }
      });

      return {
        previousStatus: user.status,
        status: updated.status
      };
    });
  }

  private async getReportOrThrow(reportId: string): Promise<ReportWithContext> {
    const report = await this.db.adReport.findUnique({
      where: {
        id: reportId
      },
      include: adReportInclude()
    });

    if (!report) {
      throw new AppError('Report not found', 404, {
        code: 'REPORT_NOT_FOUND',
        reportId
      });
    }

    return report;
  }

  private toModerationDto(report: ReportWithContext) {
    return {
      id: report.id,
      adId: report.adId,
      reportedUserId: report.reportedUserId,
      reason: report.reason,
      comment: report.comment,
      evidence: parseJson(report.evidenceJson),
      status: report.status,
      resolution: report.resolution,
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      createdAt: report.createdAt.toISOString(),
      ad: {
        id: report.ad.id,
        title: report.ad.title,
        type: report.ad.type.toLowerCase(),
        status: report.ad.status.toLowerCase(),
        ownerId: report.ad.ownerId
      },
      reportedUser: {
        id: report.reportedUser.id,
        displayName: report.reportedUser.displayName,
        maxUsername: report.reportedUser.maxUsername,
        status: report.reportedUser.status.toLowerCase(),
        blockedUntil: report.reportedUser.blockedUntil?.toISOString() ?? null
      },
      otherReportsCount: Math.max(0, report.ad._count.reports - 1),
      rejectedAdsCount: report.reportedUser.ads.filter((ad) => ad.status === AdStatus.REJECTED).length,
      moderationLogs: report.ad.moderationLogs.map((log) => ({
        id: log.id,
        action: log.action,
        statusFrom: log.statusFrom?.toLowerCase() ?? null,
        statusTo: log.statusTo?.toLowerCase() ?? null,
        reason: log.reason,
        moderatorId: log.moderatorId,
        createdAt: log.createdAt.toISOString()
      })),
      history: report.history.map((item) => ({
        id: item.id,
        action: item.action,
        statusFrom: item.statusFrom,
        statusTo: item.statusTo,
        adStatusFrom: item.adStatusFrom?.toLowerCase() ?? null,
        adStatusTo: item.adStatusTo?.toLowerCase() ?? null,
        userStatusFrom: item.userStatusFrom?.toLowerCase() ?? null,
        userStatusTo: item.userStatusTo?.toLowerCase() ?? null,
        reason: item.reason,
        moderatorId: item.moderatorId,
        createdAt: item.createdAt.toISOString()
      }))
    };
  }

  private toModerationAction(action: ResolveAdReportDto['action']): ModerationAction {
    if (action === 'warn_user') {
      return ModerationAction.USER_WARNED;
    }

    if (action === 'temp_block_user') {
      return ModerationAction.USER_TEMP_BLOCKED;
    }

    if (action === 'block_user') {
      return ModerationAction.USER_BLOCKED;
    }

    return ModerationAction.REPORT_RESOLVED;
  }

  private async notifyAuthor(report: ReportWithContext, action: ResolveAdReportDto['action'], resolution: string): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const message = getAuthorNotification(action, report.ad.title, resolution);
    await this.notificationService.notify({
      userId: report.reportedUserId,
      type: message.type,
      title: message.title,
      body: message.body,
      category: 'ad_status',
      critical: action !== 'no_violation',
      idempotencyKey: `ad-report:${report.id}:${action}:author`,
      deepLink: this.notificationService.buildMyAdsLink(),
      payload: {
        adId: report.adId,
        reportId: report.id,
        action
      }
    });
  }

  private async notifyWarning(report: ReportWithContext, resolution: string): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    await this.notificationService.notify({
      userId: report.reportedUserId,
      type: 'USER_WARNING',
      title: 'Предупреждение по объявлению',
      body: `По объявлению "${report.ad.title}" принято предупреждение: ${resolution}`,
      category: 'ad_status',
      critical: true,
      idempotencyKey: `ad-report:${report.id}:warning`,
      deepLink: this.notificationService.buildMyAdsLink(),
      payload: {
        adId: report.adId,
        reportId: report.id
      }
    });
  }
}

function adReportInclude() {
  return {
    ad: {
      select: {
        id: true,
        ownerId: true,
        title: true,
        type: true,
        status: true,
        moderationLogs: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 20
        },
        _count: {
          select: {
            reports: true
          }
        }
      }
    },
    reportedUser: {
      select: {
        id: true,
        displayName: true,
        maxUsername: true,
        status: true,
        blockedUntil: true,
        ads: {
          where: {
            status: AdStatus.REJECTED
          },
          select: {
            id: true,
            status: true
          },
          take: 100
        }
      }
    },
    history: {
      orderBy: {
        createdAt: 'asc'
      }
    }
  } satisfies Prisma.AdReportInclude;
}

function getAuthorNotification(action: ResolveAdReportDto['action'], title: string, resolution: string) {
  if (action === 'hide_ad') {
    return {
      type: 'AD_REPORT_AD_HIDDEN' as const,
      title: 'Объявление временно скрыто',
      body: `Объявление "${title}" временно скрыто по решению модерации. ${resolution}`
    };
  }

  if (action === 'send_to_moderation') {
    return {
      type: 'AD_REPORT_FIX_REQUIRED' as const,
      title: 'Требуется исправление',
      body: `Объявление "${title}" отправлено на повторную модерацию. ${resolution}`
    };
  }

  if (action === 'delete_ad') {
    return {
      type: 'AD_REPORT_AD_DELETED' as const,
      title: 'Объявление удалено',
      body: `Объявление "${title}" удалено по решению модерации. ${resolution}`
    };
  }

  return {
    type: 'AD_REPORT_RESOLVED' as const,
    title: 'По объявлению принято решение',
    body: `По объявлению "${title}" принято решение: ${resolution}`
  };
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseJson(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
