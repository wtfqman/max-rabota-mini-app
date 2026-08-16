import {
  AdStatus,
  PaymentStatus,
  UserRole,
  UserStatus,
  type Ad,
  type AdContact,
  type AdPayment,
  type PrismaClient,
  type ResumeDetails,
  type User,
  type VacancyPublicationUsage,
  type VerifiedContact
} from '@rabst24/db';
import { logger } from '@rabst24/config';
import { setTimeout as delay } from 'node:timers/promises';
import type { NotificationService } from '../notifications/notifications.service.js';

type ModerationNotificationAd = Ad & {
  owner?: Pick<User, 'id' | 'maxUserId' | 'maxUsername' | 'firstName' | 'lastName' | 'displayName'> | null;
  contacts?: Array<Pick<AdContact, 'type' | 'label' | 'value' | 'isPreferred'>>;
  payments?: Array<Pick<AdPayment, 'status' | 'refundedAt'>>;
  vacancyPublicationUsages?: Array<Pick<VacancyPublicationUsage, 'returnedAt'>>;
  resumeDetails?: (Pick<ResumeDetails, 'contactAvailabilityStatus'> & {
    verifiedContact?: Pick<VerifiedContact, 'maskedValue'> | null;
  }) | null;
};
type ModerationNotificationContact = Pick<AdContact, 'type' | 'label' | 'value' | 'isPreferred'>;

export class ModerationNotificationService {
  private notificationService: NotificationService | null = null;

  constructor(private readonly db: PrismaClient) {}

  setNotificationService(notificationService: NotificationService): void {
    this.notificationService = notificationService;
  }

  async notifyNewAd(ad: Ad, ownerId?: string): Promise<void> {
    try {
      await this.notifyNewAdUnsafe(ad, ownerId);
    } catch (error) {
      logger.warn(
        {
          err: error,
          adId: ad.id,
          ownerId
        },
        'Moderation notification failed'
      );
    }
  }

  private async notifyNewAdUnsafe(ad: Ad, ownerId?: string): Promise<void> {
    if (!this.notificationService) {
      logger.warn({ adId: ad.id }, 'NotificationService is not attached; moderation notification skipped');
      return;
    }

    const notificationAd = (await this.loadNotificationAd(ad.id)) ?? ad;

    if (notificationAd.isTest || !this.isPendingModerationNotification(notificationAd)) {
      return;
    }

    const recipients = await this.db.user.findMany({
      where: {
        role: {
          in: [UserRole.ADMIN, UserRole.MODERATOR]
        },
        status: UserStatus.ACTIVE,
        deletedAt: null
      },
      select: {
        id: true,
        role: true
      }
    });

    if (!recipients.length) {
      logger.info({ adId: ad.id }, 'No moderation notification recipients found');
      return;
    }

    const revisionId = this.getPendingRevisionId(notificationAd.metadataJson);
    const notificationTarget = revisionId ? `revision:${revisionId}` : `ad:${ad.id}`;
    const revisionContacts = revisionId ? await this.loadRevisionContacts(revisionId) : null;

    let queued = 0;
    let skipped = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        const result = await this.notifyRecipientWithRetry({
          userId: recipient.id,
          type: 'AD_SUBMITTED_MODERATION',
          title: 'Новое объявление на модерацию',
          body: this.formatMessage(notificationAd, revisionContacts),
          category: 'ad_status',
          critical: true,
          idempotencyKey: `moderation:${notificationTarget}:recipient:${recipient.id}:submitted`,
          deepLink: this.notificationService.buildModerationLink(ad.id),
          payload: {
            adId: ad.id,
            revisionId,
            ownerId,
            recipientRole: recipient.role.toLowerCase()
          }
        });

        if (result === 'queued') {
          queued += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        logger.warn(
          {
            err: error,
            adId: ad.id,
            recipientId: recipient.id
          },
          'Moderation notification enqueue failed'
        );
      }
    }

    const logPayload = { adId: ad.id, ownerId, recipients: recipients.length, queued, skipped, failed };

    if (failed > 0) {
      logger.warn(logPayload, 'Moderation notification queued partially');
      return;
    }

    logger.info(logPayload, 'Moderation notification queued');
  }

  private async notifyRecipientWithRetry(input: Parameters<NotificationService['notify']>[0]): Promise<'queued' | 'skipped'> {
    if (!this.notificationService) {
      return 'skipped';
    }

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const notification = await this.notificationService.notify(input);
        return notification ? 'queued' : 'skipped';
      } catch (error) {
        if (attempt >= 4 || !this.isTransientStorageError(error)) {
          throw error;
        }

        logger.warn(
          {
            err: error,
            userId: input.userId,
            idempotencyKey: input.idempotencyKey,
            attempt
          },
          'Moderation notification enqueue retrying'
        );

        await delay(250 * 2 ** (attempt - 1));
      }
    }

    return 'skipped';
  }

  private async loadNotificationAd(adId: string): Promise<ModerationNotificationAd | null> {
    return this.db.ad.findUnique({
      where: {
        id: adId
      },
      include: {
        owner: {
          select: {
            id: true,
            maxUserId: true,
            maxUsername: true,
            firstName: true,
            lastName: true,
            displayName: true
          }
        },
        contacts: {
          where: {
            deletedAt: null
          },
          orderBy: [
            {
              isPreferred: 'desc'
            },
            {
              sortOrder: 'asc'
            }
          ]
        },
        payments: {
          where: {
            status: PaymentStatus.SUCCEEDED,
            refundedAt: null
          },
          select: {
            status: true,
            refundedAt: true
          },
          take: 1
        },
        vacancyPublicationUsages: {
          where: {
            returnedAt: null
          },
          select: {
            returnedAt: true
          },
          take: 1
        },
        resumeDetails: {
          select: {
            contactAvailabilityStatus: true,
            verifiedContact: {
              select: {
                maskedValue: true
              }
            }
          }
        }
      }
    });
  }

  private async loadRevisionContacts(revisionId: string): Promise<ModerationNotificationContact[] | null> {
    if (revisionId === 'pending') {
      return null;
    }

    const revision = await this.db.adRevision.findUnique({
      where: {
        id: revisionId
      },
      select: {
        dataJson: true
      }
    });

    if (!revision) {
      return null;
    }

    try {
      const data = JSON.parse(revision.dataJson) as {
        contacts?: Array<{
          type?: unknown;
          label?: unknown;
          value?: unknown;
          isPreferred?: unknown;
        }>;
      };

      if (!Array.isArray(data.contacts)) {
        return null;
      }

      return data.contacts
        .map((contact, index) => {
          if (typeof contact.type !== 'string' || typeof contact.value !== 'string') {
            return null;
          }

          return {
            type: contact.type as AdContact['type'],
            label: typeof contact.label === 'string' ? contact.label : null,
            value: contact.value,
            isPreferred: typeof contact.isPreferred === 'boolean' ? contact.isPreferred : index === 0
          };
        })
        .filter((contact): contact is ModerationNotificationContact => Boolean(contact));
    } catch {
      return null;
    }
  }

  private formatMessage(ad: ModerationNotificationAd, revisionContacts: ModerationNotificationContact[] | null = null): string {
    return [
      `${this.getTypeLabel(ad.type.toLowerCase())}: ${ad.title}`,
      ad.districtText ? `Район: ${ad.districtText}` : null,
      ad.city ? `Город: ${ad.city}` : null,
      ...this.formatOwnerLines(ad.owner),
      ...this.formatContactLines(ad, revisionContacts),
      'Откройте очередь модерации, чтобы проверить и опубликовать.'
    ]
      .filter(Boolean)
      .join('\n');
  }

  private formatOwnerLines(owner: ModerationNotificationAd['owner']): Array<string | null> {
    if (!owner) {
      return ['Аккаунт: не найден'];
    }

    const fullName = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
    const displayName = owner.displayName?.trim() || fullName || owner.maxUsername || `MAX ${owner.maxUserId}`;
    const username = owner.maxUsername?.trim();

    return [
      `Аккаунт: ${displayName}`,
      `MAX ID: ${owner.maxUserId}`,
      username ? `MAX username: ${username.startsWith('@') ? username : `@${username}`}` : null
    ];
  }

  private formatContactLines(ad: ModerationNotificationAd, revisionContacts: ModerationNotificationContact[] | null = null): string[] {
    const contacts = revisionContacts?.length ? revisionContacts : ad.contacts ?? [];
    const visibleContacts = contacts.filter((contact) => contact.value.trim()).slice(0, 4);

    if (visibleContacts.length) {
      return visibleContacts.map((contact) => {
        const type = contact.type.toLowerCase();
        const label = contact.label?.trim() || this.getContactTypeLabel(type);
        const preferred = contact.isPreferred ? ' (основной)' : '';

        return `${label}${preferred}: ${contact.value}`;
      });
    }

    const verifiedResumeContact = ad.resumeDetails?.verifiedContact?.maskedValue?.trim();

    if (verifiedResumeContact) {
      return [`Телефон: ${verifiedResumeContact}`];
    }

    const maxUsername = ad.owner?.maxUsername?.trim();
    const maxContact = maxUsername ? (maxUsername.startsWith('@') ? maxUsername : `@${maxUsername}`) : null;

    if (maxContact) {
      return [`MAX: ${maxContact}`];
    }

    return ['Телефон/контакт: не указан'];
  }

  private getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      vacancy: 'Вакансия',
      resume: 'Резюме',
      equipment: 'Техника',
      material: 'Материалы',
      tool: 'Инструменты'
    };

    return labels[type] ?? 'Объявление';
  }

  private getContactTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      phone: 'Телефон',
      max: 'MAX',
      email: 'Email',
      website: 'Сайт',
      other: 'Контакт'
    };

    return labels[type] ?? 'Контакт';
  }

  private isPendingModerationNotification(ad: Pick<Ad, 'status' | 'metadataJson'>): boolean {
    return ad.status === AdStatus.PENDING_MODERATION || this.hasPendingRevision(ad.metadataJson);
  }

  private hasPendingRevision(metadataJson: string | null): boolean {
    return Boolean(this.getPendingRevisionId(metadataJson));
  }

  private getPendingRevisionId(metadataJson: string | null): string | null {
    if (!metadataJson) {
      return null;
    }

    try {
      const metadata = JSON.parse(metadataJson) as { activeRevisionId?: unknown; activeRevisionStatus?: unknown };

      if (metadata.activeRevisionStatus !== 'PENDING_MODERATION') {
        return null;
      }

      return typeof metadata.activeRevisionId === 'string' && metadata.activeRevisionId.trim()
        ? metadata.activeRevisionId.trim()
        : 'pending';
    } catch {
      return metadataJson.includes('"activeRevisionStatus":"PENDING_MODERATION"') ? 'pending' : null;
    }
  }

  private isTransientStorageError(error: unknown): boolean {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    const message = error instanceof Error ? error.message : String(error);

    return (
      code === 'P1008' ||
      code === 'P1002' ||
      code === 'P2034' ||
      /database is locked|socket timeout|timed out|timeout/i.test(message)
    );
  }
}
