import { AdStatus, UserRole, UserStatus, type Ad, type AdContact, type PrismaClient, type User } from '@rabst24/db';
import { logger } from '@rabst24/config';
import type { NotificationService } from '../notifications/notifications.service.js';

type ModerationNotificationAd = Ad & {
  owner?: Pick<User, 'id' | 'maxUserId' | 'maxUsername' | 'firstName' | 'lastName' | 'displayName'> | null;
  contacts?: Array<Pick<AdContact, 'type' | 'label' | 'value' | 'isPreferred'>>;
};

export class ModerationNotificationService {
  private notificationService: NotificationService | null = null;

  constructor(private readonly db: PrismaClient) {}

  setNotificationService(notificationService: NotificationService): void {
    this.notificationService = notificationService;
  }

  async notifyNewAd(ad: Ad, ownerId?: string): Promise<void> {
    if (ad.status !== AdStatus.PENDING_MODERATION || ad.isTest) {
      return;
    }

    if (!this.notificationService) {
      logger.warn({ adId: ad.id }, 'NotificationService is not attached; moderation notification skipped');
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

    const notificationAd = (await this.loadNotificationAd(ad.id)) ?? ad;

    await Promise.allSettled(
      recipients.map((recipient) =>
        this.notificationService?.notify({
          userId: recipient.id,
          type: 'AD_SUBMITTED_MODERATION',
          title: 'Новое объявление на модерацию',
          body: this.formatMessage(notificationAd),
          category: 'ad_status',
          critical: true,
          idempotencyKey: `moderation:ad:${ad.id}:recipient:${recipient.id}:submitted`,
          deepLink: this.notificationService.buildModerationLink(ad.id),
          payload: {
            adId: ad.id,
            ownerId,
            recipientRole: recipient.role.toLowerCase()
          }
        })
      )
    );

    logger.info({ adId: ad.id, ownerId, recipients: recipients.length }, 'Moderation notification queued');
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
            deletedAt: null,
            isPublic: true
          },
          orderBy: [
            {
              isPreferred: 'desc'
            },
            {
              sortOrder: 'asc'
            }
          ]
        }
      }
    });
  }

  private formatMessage(ad: ModerationNotificationAd): string {
    return [
      `${this.getTypeLabel(ad.type.toLowerCase())}: ${ad.title}`,
      ad.districtText ? `Район: ${ad.districtText}` : null,
      ad.city ? `Город: ${ad.city}` : null,
      ...this.formatOwnerLines(ad.owner),
      ...this.formatContactLines(ad.contacts),
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

  private formatContactLines(contacts: ModerationNotificationAd['contacts']): string[] {
    const visibleContacts = (contacts ?? []).filter((contact) => contact.value.trim()).slice(0, 4);

    if (!visibleContacts.length) {
      return ['Телефон/контакт: не указан'];
    }

    return visibleContacts.map((contact) => {
      const type = contact.type.toLowerCase();
      const label = contact.label?.trim() || this.getContactTypeLabel(type);
      const preferred = contact.isPreferred ? ' (основной)' : '';

      return `${label}${preferred}: ${contact.value}`;
    });
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
}
