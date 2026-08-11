import { logger } from '@rabst24/config';
import {
  AdStatus,
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  Prisma,
  UserStatus,
  type Notification,
  type NotificationDelivery,
  type NotificationPreference,
  type PrismaClient
} from '@rabst24/db';
import type { MaxButton } from '@rabst24/max-api';
import type { MaxApiClient } from '@rabst24/max-api';
import { AppError } from '@rabst24/shared';
import type { OutboxService } from '../outbox/outbox.service.js';
import type { NotificationListQuery, NotificationPreferencesPayload } from './notifications.schemas.js';

export const NOTIFICATION_TYPES = [
  'AD_CREATED',
  'AD_SUBMITTED_MODERATION',
  'AD_APPROVED',
  'AD_PUBLISHED',
  'AD_REJECTED',
  'PAYMENT_CONFIRMED',
  'PUBLICATIONS_GRANTED',
  'RESUME_CONTACT_UNLOCKED',
  'CONTACT_VERIFIED',
  'RESUME_CONNECTION_ACCESS_ACTIVE',
  'RESUME_CONNECTION_PURCHASED',
  'CONTACT_DISPUTE_OPENED',
  'JOB_APPLICATION_RECEIVED',
  'JOB_APPLICATION_STATUS_CHANGED',
  'REFERRAL_BONUS_RECEIVED',
  'PUBLICATION_EXPIRING',
  'LOW_PUBLICATION_BALANCE',
  'SAVED_SEARCH_MATCHES',
  'PROMOTION_ACTIVATED',
  'PROMOTION_EXPIRED',
  'REFUND_COMPLETED',
  'AD_REPORT_AD_HIDDEN',
  'AD_REPORT_FIX_REQUIRED',
  'AD_REPORT_AD_DELETED',
  'AD_REPORT_RESOLVED',
  'AD_REPORT_CREATED',
  'USER_WARNING'
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationCategory = 'ad_status' | 'applications' | 'saved_searches' | 'payments' | 'marketing';

export interface NotificationDeepLink {
  label: string;
  path: string;
  startParam?: string;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  idempotencyKey: string;
  category: NotificationCategory;
  payload?: Record<string, unknown>;
  deepLink?: NotificationDeepLink;
  critical?: boolean;
  channels?: Array<'IN_APP' | 'MAX'>;
}

export interface NotificationPayload {
  category: NotificationCategory;
  critical: boolean;
  deepLink?: NotificationDeepLink;
  data?: Record<string, unknown>;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: NotificationPayload | null;
  readAt: string | null;
  createdAt: string;
  deliveries: Array<{
    channel: 'MAX' | 'IN_APP';
    status: string;
    attempts: number;
    sentAt: string | null;
    lastError: string | null;
  }>;
}

export interface NotificationPreferencesDto {
  adStatusEnabled: boolean;
  applicationsEnabled: boolean;
  savedSearchesEnabled: boolean;
  paymentsEnabled: boolean;
  marketingEnabled: boolean;
}

type NotificationWithDeliveries = Notification & {
  deliveries: NotificationDelivery[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PUBLICATION_WINDOW_MS = 7 * DAY_MS;
const LOW_PUBLICATION_BALANCE_THRESHOLD = 1;
const LOW_PUBLICATION_BALANCE_LOOKBACK_MS = 2 * DAY_MS;
const SCHEDULED_NOTIFICATION_BATCH_SIZE = 1;

export class NotificationService {
  constructor(
    private readonly db: PrismaClient,
    private readonly outboxService: OutboxService,
    private readonly maxApiClient: MaxApiClient,
    private readonly settings: {
      miniAppUrl: string;
      miniAppWebApp?: string | null;
    }
  ) {}

  async notify(input: CreateNotificationInput): Promise<NotificationDto | null> {
    const idempotencyKey = input.idempotencyKey.trim();

    if (!idempotencyKey) {
      throw new AppError('Notification idempotency key is required', 400, {
        code: 'NOTIFICATION_IDEMPOTENCY_KEY_REQUIRED'
      });
    }

    const existing = await this.db.notification.findUnique({
      where: {
        idempotencyKey
      },
      include: {
        deliveries: true
      }
    });

    if (existing) {
      await this.enqueuePendingMaxDelivery(existing);
      return this.toDto(existing);
    }

    const user = await this.db.user.findUnique({
      where: {
        id: input.userId
      },
      select: {
        id: true,
        maxUserId: true,
        status: true,
        notificationPreference: true
      }
    });

    if (!user || user.status === UserStatus.DELETED) {
      return null;
    }

    const preferences = user.notificationPreference ?? this.getDefaultPreferences();
    const allowedByPreferences = input.critical || this.isCategoryEnabled(input.category, preferences);

    if (!allowedByPreferences) {
      return null;
    }

    const payload: NotificationPayload = {
      category: input.category,
      critical: Boolean(input.critical),
      ...(input.deepLink ? { deepLink: input.deepLink } : {}),
      ...(input.payload ? { data: input.payload } : {})
    };

    const channels = input.channels ?? ['IN_APP', 'MAX'];
    const shouldCreateMaxDelivery = channels.includes('MAX');

    try {
      const created = await this.db.$transaction(async (tx) => {
        const notification = await tx.notification.create({
          data: {
            userId: input.userId,
            type: input.type,
            title: input.title.trim(),
            body: input.body.trim(),
            idempotencyKey,
            payloadJson: JSON.stringify(payload)
          }
        });

        const deliveries: NotificationDelivery[] = [];

        if (channels.includes('IN_APP')) {
          deliveries.push(
            await tx.notificationDelivery.create({
              data: {
                notificationId: notification.id,
                channel: NotificationDeliveryChannel.IN_APP,
                status: NotificationDeliveryStatus.SUCCEEDED,
                sentAt: new Date()
              }
            })
          );
        }

        if (shouldCreateMaxDelivery) {
          deliveries.push(
            await tx.notificationDelivery.create({
              data: {
                notificationId: notification.id,
                channel: NotificationDeliveryChannel.MAX,
                status:
                  user.status === UserStatus.ACTIVE && user.maxUserId
                    ? NotificationDeliveryStatus.PENDING
                    : NotificationDeliveryStatus.SKIPPED,
                lastError: user.status === UserStatus.ACTIVE && user.maxUserId ? null : 'max_delivery_unavailable'
              }
            })
          );
        }

        return {
          ...notification,
          deliveries
        };
      }, {
        maxWait: 10_000,
        timeout: 20_000
      });

      await this.enqueuePendingMaxDelivery(created);

      return this.toDto(created);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const raced = await this.db.notification.findUnique({
          where: {
            idempotencyKey
          },
          include: {
            deliveries: true
          }
        });

        if (raced) {
          await this.enqueuePendingMaxDelivery(raced);
          return this.toDto(raced);
        }

        return null;
      }

      throw error;
    }
  }

  private async enqueuePendingMaxDelivery(notification: NotificationWithDeliveries): Promise<void> {
    const maxDelivery = notification.deliveries.find(
      (delivery) =>
        delivery.channel === NotificationDeliveryChannel.MAX &&
        (delivery.status === NotificationDeliveryStatus.PENDING || delivery.status === NotificationDeliveryStatus.FAILED)
    );

    if (!maxDelivery) {
      return;
    }

    await this.outboxService.enqueue({
      type: 'MAX_NOTIFICATION',
      payload: {
        notificationId: notification.id,
        deliveryId: maxDelivery.id
      },
      idempotencyKey: `notification:max:${notification.id}`,
      maxAttempts: 5,
      reviveTerminal: true
    });
  }

  async handleMaxNotificationJob(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const notificationId = String(payload.notificationId ?? '');
    const deliveryId = String(payload.deliveryId ?? '');

    if (!notificationId || !deliveryId) {
      if (typeof payload.userId === 'string' && typeof payload.message === 'string') {
        return this.handleLegacyMaxNotificationJob(payload.userId, payload.message);
      }

      throw new AppError('MAX notification job payload is invalid', 400, {
        code: 'MAX_NOTIFICATION_PAYLOAD_INVALID'
      });
    }

    const delivery = await this.db.notificationDelivery.findFirst({
      where: {
        id: deliveryId,
        notificationId,
        channel: NotificationDeliveryChannel.MAX
      },
      include: {
        notification: {
          include: {
            user: {
              select: {
                id: true,
                maxUserId: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!delivery) {
      return {
        skipped: true,
        reason: 'delivery_not_found'
      };
    }

    if (delivery.status === NotificationDeliveryStatus.SUCCEEDED) {
      return {
        skipped: true,
        reason: 'already_sent'
      };
    }

    if (delivery.notification.user.status !== UserStatus.ACTIVE) {
      await this.markDeliverySkipped(delivery.id, 'blocked_user');
      return {
        skipped: true,
        reason: 'blocked_user'
      };
    }

    if (!delivery.notification.user.maxUserId) {
      await this.markDeliverySkipped(delivery.id, 'missing_max_user_id');
      return {
        skipped: true,
        reason: 'missing_max_user_id'
      };
    }

    await this.db.notificationDelivery.update({
      where: {
        id: delivery.id
      },
      data: {
        status: NotificationDeliveryStatus.PROCESSING
      }
    });

    try {
      const payloadJson = this.parsePayload(delivery.notification.payloadJson);
      const response = await this.maxApiClient.sendMessage({
        userId: delivery.notification.user.maxUserId,
        disableLinkPreview: true,
        body: {
          text: this.formatMaxText(delivery.notification.title, delivery.notification.body),
          format: 'markdown',
          notify: true,
          attachments: this.buildMaxAttachments(payloadJson?.deepLink)
        }
      });

      const externalMessageId = this.extractExternalMessageId(response);

      await this.db.notificationDelivery.update({
        where: {
          id: delivery.id
        },
        data: {
          status: NotificationDeliveryStatus.SUCCEEDED,
          attempts: {
            increment: 1
          },
          sentAt: new Date(),
          lastError: null,
          externalMessageId
        }
      });

      return {
        sent: true,
        externalMessageId
      };
    } catch (error) {
      const safeError = this.sanitizeError(error);
      const isPermanentDeliveryError = this.isPermanentMaxDeliveryError(error);
      await this.db.notificationDelivery.update({
        where: {
          id: delivery.id
        },
        data: {
          status: isPermanentDeliveryError ? NotificationDeliveryStatus.SKIPPED : NotificationDeliveryStatus.FAILED,
          attempts: {
            increment: 1
          },
          lastError: safeError
        }
      });
      logger.warn(
        {
          notificationId,
          deliveryId,
          error: safeError
        },
        'MAX notification delivery failed'
      );

      if (isPermanentDeliveryError) {
        return {
          skipped: true,
          reason: 'max_dialog_unavailable'
        };
      }

      throw error;
    }
  }

  async listForUser(userId: string, query: NotificationListQuery): Promise<{
    items: NotificationDto[];
    unreadTotal: number;
    nextCursor: string | null;
  }> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unread ? { readAt: null } : {})
    };
    const items = await this.db.notification.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: {
              id: query.cursor
            },
            skip: 1
          }
        : {}),
      include: {
        deliveries: true
      }
    });
    const unreadTotal = await this.db.notification.count({
      where: {
        userId,
        readAt: null
      }
    });
    const pageItems = items.slice(0, query.limit);

    return {
      items: pageItems.map((item) => this.toDto(item)),
      unreadTotal,
      nextCursor: items.length > query.limit ? pageItems.at(-1)?.id ?? null : null
    };
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationDto> {
    const notification = await this.db.notification.findFirst({
      where: {
        id: notificationId,
        userId
      },
      include: {
        deliveries: true
      }
    });

    if (!notification) {
      throw new AppError('Notification not found', 404, {
        code: 'NOTIFICATION_NOT_FOUND'
      });
    }

    if (notification.readAt) {
      return this.toDto(notification);
    }

    const updated = await this.db.notification.update({
      where: {
        id: notification.id
      },
      data: {
        readAt: new Date()
      },
      include: {
        deliveries: true
      }
    });

    return this.toDto(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.db.notification.updateMany({
      where: {
        userId,
        readAt: null
      },
      data: {
        readAt: new Date()
      }
    });

    return {
      updated: result.count
    };
  }

  async enqueueScheduledUserNotifications(now = new Date()): Promise<{
    publicationExpiring: number;
    lowPublicationBalance: number;
  }> {
    const publicationExpiring = await this.notifyPublicationExpiring(now);

    if (publicationExpiring > 0) {
      return {
        publicationExpiring,
        lowPublicationBalance: 0
      };
    }

    const lowPublicationBalance = await this.notifyLowPublicationBalances(now);

    return {
      publicationExpiring,
      lowPublicationBalance
    };
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesDto> {
    const preferences = await this.db.notificationPreference.upsert({
      where: {
        userId
      },
      update: {},
      create: {
        userId
      }
    });

    return this.toPreferencesDto(preferences);
  }

  async updatePreferences(userId: string, payload: NotificationPreferencesPayload): Promise<NotificationPreferencesDto> {
    const preferences = await this.db.notificationPreference.upsert({
      where: {
        userId
      },
      update: payload,
      create: {
        userId,
        ...payload
      }
    });

    return this.toPreferencesDto(preferences);
  }

  buildAdLink(adId: string, type?: string): NotificationDeepLink {
    const normalizedType = type?.toLowerCase();
    const routeByType: Record<string, string> = {
      vacancy: 'vacancies',
      resume: 'resumes',
      equipment: 'equipment',
      material: 'materials',
      tool: 'tools'
    };
    const route = normalizedType ? routeByType[normalizedType] : null;
    const path = route ? `/${route}/${adId}` : `/ads/${adId}`;

    return {
      label: 'Открыть объявление',
      path,
      startParam: route && normalizedType ? `ad_${normalizedType}_${adId}` : `ad_${adId}`
    };
  }

  buildMyAdsLink(adId?: string | null): NotificationDeepLink {
    return {
      label: 'Открыть Мои объявления',
      path: adId ? `/my-ads?adId=${encodeURIComponent(adId)}` : '/my-ads',
      startParam: adId ? `my_ad_${adId}` : 'my_ads'
    };
  }

  buildProfileLink(): NotificationDeepLink {
    return {
      label: 'Открыть профиль',
      path: '/profile',
      startParam: 'profile'
    };
  }

  buildPaymentLink(paymentId?: string | null): NotificationDeepLink {
    return {
      label: 'Открыть оплату',
      path: paymentId ? `/profile?payment=${encodeURIComponent(paymentId)}` : '/profile',
      startParam: paymentId ? `payment_${paymentId}` : 'profile'
    };
  }

  buildModerationLink(adId?: string | null): NotificationDeepLink {
    return {
      label: 'Открыть модерацию',
      path: adId ? `/moderation?adId=${encodeURIComponent(adId)}` : '/moderation',
      startParam: adId ? `moderation_${adId}` : 'moderation'
    };
  }

  private async notifyPublicationExpiring(now: Date): Promise<number> {
    const remindUntil = new Date(now.getTime() + DAY_MS);
    const syntheticPublishedFrom = new Date(now.getTime() - DEFAULT_PUBLICATION_WINDOW_MS);
    const syntheticPublishedTo = new Date(remindUntil.getTime() - DEFAULT_PUBLICATION_WINDOW_MS);
    const ads = await this.db.ad.findMany({
      where: {
        status: AdStatus.PUBLISHED,
        deletedAt: null,
        publishedAt: {
          not: null
        },
        OR: [
          {
            expiresAt: {
              gt: now,
              lte: remindUntil
            }
          },
          {
            expiresAt: null,
            publishedAt: {
              gte: syntheticPublishedFrom,
              lte: syntheticPublishedTo
            }
          }
        ]
      },
      select: {
        id: true,
        ownerId: true,
        type: true,
        title: true,
        publishedAt: true,
        expiresAt: true,
        metadataJson: true
      },
      take: SCHEDULED_NOTIFICATION_BATCH_SIZE,
      orderBy: {
        publishedAt: 'asc'
      }
    });

    let notified = 0;

    for (const ad of ads) {
      if (!ad.publishedAt || !this.shouldRemindBeforePublicationEnd(ad.metadataJson)) {
        continue;
      }

      const endsAt = ad.expiresAt ?? new Date(ad.publishedAt.getTime() + DEFAULT_PUBLICATION_WINDOW_MS);

      if (endsAt <= now || endsAt > remindUntil) {
        continue;
      }

      const notificationCreated = await this.tryNotifyScheduled({
        userId: ad.ownerId,
        type: 'PUBLICATION_EXPIRING',
        title: 'Публикация скоро закончится',
        body: `Объявление «${ad.title}» перестанет показываться ${this.formatRuDateTime(endsAt)}.`,
        category: 'ad_status',
        critical: true,
        idempotencyKey: `ad:${ad.id}:publication-expiring:${this.formatDateKey(endsAt)}`,
        deepLink: this.buildAdLink(ad.id, ad.type),
        payload: {
          adId: ad.id,
          endsAt: endsAt.toISOString()
        }
      });

      if (notificationCreated) {
        notified += 1;
      }
    }

    return notified;
  }

  private async notifyLowPublicationBalances(now: Date): Promise<number> {
    const changedSince = new Date(now.getTime() - LOW_PUBLICATION_BALANCE_LOOKBACK_MS);
    const balances = await this.db.userVacancyPublicationBalance.findMany({
      where: {
        remaining: {
          lte: LOW_PUBLICATION_BALANCE_THRESHOLD
        },
        updatedAt: {
          gte: changedSince
        },
        user: {
          status: UserStatus.ACTIVE
        },
        OR: [
          {
            purchased: {
              gt: 0
            }
          },
          {
            bonus: {
              gt: 0
            }
          },
          {
            used: {
              gt: 0
            }
          }
        ]
      },
      select: {
        userId: true,
        remaining: true,
        updatedAt: true
      },
      take: SCHEDULED_NOTIFICATION_BATCH_SIZE,
      orderBy: {
        updatedAt: 'asc'
      }
    });

    let notified = 0;

    for (const balance of balances) {
      const notificationCreated = await this.tryNotifyScheduled({
        userId: balance.userId,
        type: 'LOW_PUBLICATION_BALANCE',
        title: 'На балансе мало публикаций',
        body:
          balance.remaining > 0
            ? `Осталось публикаций: ${balance.remaining}. Пополните баланс заранее, чтобы новые вакансии не остановились.`
            : 'Публикации закончились. Пополните баланс, чтобы размещать новые вакансии без паузы.',
        category: 'payments',
        critical: true,
        idempotencyKey: `vacancy-publication-balance:${balance.userId}:low:${this.formatDateKey(balance.updatedAt)}:${balance.remaining}`,
        deepLink: this.buildProfileLink(),
        payload: {
          remaining: balance.remaining,
          balanceUpdatedAt: balance.updatedAt.toISOString()
        }
      });

      if (notificationCreated) {
        notified += 1;
      }
    }

    return notified;
  }

  private async tryNotifyScheduled(input: CreateNotificationInput): Promise<boolean> {
    try {
      const notification = await this.notify(input);
      return Boolean(notification);
    } catch (error) {
      logger.warn(
        {
          err: error,
          type: input.type,
          idempotencyKey: input.idempotencyKey
        },
        'Scheduled notification enqueue failed'
      );
      return false;
    }
  }

  private async markDeliverySkipped(deliveryId: string, reason: string): Promise<void> {
    await this.db.notificationDelivery.update({
      where: {
        id: deliveryId
      },
      data: {
        status: NotificationDeliveryStatus.SKIPPED,
        lastError: reason
      }
    });
  }

  private async handleLegacyMaxNotificationJob(userId: string, message: string): Promise<Record<string, unknown>> {
    const user = await this.db.user.findUnique({
      where: {
        id: userId
      },
      select: {
        maxUserId: true,
        status: true
      }
    });

    if (!user || user.status !== UserStatus.ACTIVE || !user.maxUserId) {
      return {
        skipped: true,
        reason: 'legacy_recipient_unavailable'
      };
    }

    const response = await this.maxApiClient.sendMessage({
      userId: user.maxUserId,
      disableLinkPreview: true,
      body: {
        text: message,
        notify: true
      }
    });

    return {
      sent: true,
      externalMessageId: this.extractExternalMessageId(response)
    };
  }

  private buildMaxAttachments(deepLink?: NotificationDeepLink): Array<{ type: 'inline_keyboard'; payload: { buttons: MaxButton[][] } }> | null {
    if (!deepLink) {
      return null;
    }

    return [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [
              {
                type: 'open_app',
                text: deepLink.label,
                web_app: this.buildMiniAppUrl(deepLink),
                payload: deepLink.startParam ?? deepLink.path
              }
            ]
          ]
        }
      }
    ];
  }

  private buildMiniAppUrl(deepLink: NotificationDeepLink): string {
    const baseUrl = this.settings.miniAppWebApp || this.settings.miniAppUrl;
    const url = new URL(baseUrl);
    url.searchParams.set('startapp', deepLink.startParam ?? deepLink.path);
    return url.toString();
  }

  private formatMaxText(title: string, body: string): string {
    return `*${this.escapeMarkdown(title)}*\n${this.escapeMarkdown(body)}`;
  }

  private escapeMarkdown(value: string): string {
    return value.replace(/([*_`[\]])/g, '\\$1');
  }

  private parsePayload(payloadJson: string | null): NotificationPayload | null {
    if (!payloadJson) {
      return null;
    }

    try {
      return JSON.parse(payloadJson) as NotificationPayload;
    } catch {
      return null;
    }
  }

  private extractExternalMessageId(response: unknown): string | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    const record = response as Record<string, unknown>;
    const body = record.body && typeof record.body === 'object' ? (record.body as Record<string, unknown>) : null;
    const candidates = [record.id, record.message_id, record.mid, body?.mid];
    const value = candidates.find((candidate) => typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'bigint');

    return value === undefined ? null : String(value);
  }

  private toDto(notification: NotificationWithDeliveries): NotificationDto {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      payload: this.parsePayload(notification.payloadJson),
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
      deliveries: notification.deliveries.map((delivery) => ({
        channel: delivery.channel,
        status: delivery.status.toLowerCase(),
        attempts: delivery.attempts,
        sentAt: delivery.sentAt?.toISOString() ?? null,
        lastError: delivery.lastError
      }))
    };
  }

  private toPreferencesDto(preferences: NotificationPreference): NotificationPreferencesDto {
    return {
      adStatusEnabled: preferences.adStatusEnabled,
      applicationsEnabled: preferences.applicationsEnabled,
      savedSearchesEnabled: preferences.savedSearchesEnabled,
      paymentsEnabled: preferences.paymentsEnabled,
      marketingEnabled: preferences.marketingEnabled
    };
  }

  private getDefaultPreferences(): NotificationPreferencesDto {
    return {
      adStatusEnabled: true,
      applicationsEnabled: true,
      savedSearchesEnabled: true,
      paymentsEnabled: true,
      marketingEnabled: false
    };
  }

  private isCategoryEnabled(category: NotificationCategory, preferences: NotificationPreferencesDto): boolean {
    switch (category) {
      case 'ad_status':
        return preferences.adStatusEnabled;
      case 'applications':
        return preferences.applicationsEnabled;
      case 'saved_searches':
        return preferences.savedSearchesEnabled;
      case 'payments':
        return preferences.paymentsEnabled;
      case 'marketing':
        return preferences.marketingEnabled;
    }
  }

  private sanitizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const parts = [message];

    if (error instanceof AppError) {
      parts.push(`status=${error.statusCode}`);

      if (error.details !== undefined) {
        parts.push(`details=${this.safeStringify(error.details)}`);
      }
    }

    return this.redact(parts.join(' | ')).slice(0, 1000);
  }

  private safeStringify(value: unknown): string {
    try {
      return typeof value === 'string' ? value : JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private redact(value: string): string {
    return value.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]');
  }

  private isPermanentMaxDeliveryError(error: unknown): boolean {
    return error instanceof AppError && (error.statusCode === 403 || error.statusCode === 404);
  }

  private shouldRemindBeforePublicationEnd(metadataJson: string | null): boolean {
    if (!metadataJson) {
      return true;
    }

    try {
      const metadata = JSON.parse(metadataJson) as unknown;

      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return true;
      }

      const publicationSettings = (metadata as Record<string, unknown>).publicationSettings;

      if (!publicationSettings || typeof publicationSettings !== 'object' || Array.isArray(publicationSettings)) {
        return true;
      }

      return (publicationSettings as Record<string, unknown>).remindBeforeEnd !== false;
    } catch {
      return true;
    }
  }

  private formatDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatRuDateTime(date: Date): string {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
