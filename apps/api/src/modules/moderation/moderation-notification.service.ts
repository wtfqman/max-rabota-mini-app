import {
  AdStatus,
  UserRole,
  UserStatus,
  type Ad,
  type AdContact,
  type PrismaClient,
  type User
} from '@rabst24/db';
import { config, logger } from '@rabst24/config';
import type { MaxApiClient, MaxButton, MaxInlineKeyboardAttachment } from '@rabst24/max-api';

const MODERATION_START_PARAM = 'moderation';

type ModerationNotificationAd = Ad & {
  owner?: Pick<User, 'id' | 'maxUserId' | 'maxUsername' | 'firstName' | 'lastName' | 'displayName'> | null;
  contacts?: Array<Pick<AdContact, 'type' | 'label' | 'value' | 'isPreferred'>>;
};

export class ModerationNotificationService {
  constructor(
    private readonly db: PrismaClient,
    private readonly maxApiClient: MaxApiClient
  ) {}

  async notifyNewAd(ad: Ad, ownerId?: string): Promise<void> {
    if (ad.status !== AdStatus.PENDING_MODERATION || ad.isTest) {
      return;
    }

    const recipients = await this.db.user.findMany({
      where: {
        role: {
          in: [UserRole.ADMIN, UserRole.MODERATOR]
        },
        status: UserStatus.ACTIVE,
        deletedAt: null,
        id: ownerId ? { not: ownerId } : undefined
      },
      select: {
        id: true,
        maxUserId: true,
        role: true
      }
    });

    if (!recipients.length) {
      logger.info({ adId: ad.id }, 'No moderation notification recipients found');
      return;
    }

    const notificationAd = (await this.loadNotificationAd(ad.id)) ?? ad;

    await Promise.allSettled(
      recipients.map(async (recipient) => {
        try {
          await this.maxApiClient.sendMessage({
            userId: recipient.maxUserId,
            disableLinkPreview: true,
            body: {
              text: this.formatMessage(notificationAd),
              attachments: [this.createKeyboard()]
            }
          });
        } catch (error) {
          logger.warn(
            {
              err: error,
              adId: ad.id,
              recipientId: recipient.id,
              recipientRole: recipient.role.toLowerCase()
            },
            'Failed to send moderation notification'
          );
        }
      })
    );

    logger.info({ adId: ad.id, recipients: recipients.length }, 'Moderation notification sent');
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
      'Новое объявление на модерацию',
      '',
      `${this.getTypeLabel(ad.type.toLowerCase())}: ${ad.title}`,
      ad.districtText ? `Район: ${ad.districtText}` : null,
      ad.city ? `Город: ${ad.city}` : null,
      '',
      ...this.formatOwnerLines(ad.owner),
      ...this.formatContactLines(ad.contacts),
      '',
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

  private createKeyboard(): MaxInlineKeyboardAttachment {
    return {
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [
            this.createOpenModerationButton()
          ]
        ]
      }
    };
  }

  private createOpenModerationButton(): MaxButton {
    const webApp = this.getMiniAppLaunchValue(MODERATION_START_PARAM);

    if (webApp) {
      return {
        type: 'open_app',
        text: 'Открыть модерацию',
        web_app: webApp,
        payload: MODERATION_START_PARAM
      };
    }

    return {
      type: 'link',
      text: 'Открыть модерацию',
      url: `${config.miniAppUrl.replace(/\/+$/, '')}/moderation`
    };
  }

  private getMiniAppLaunchValue(payload: string): string | null {
    const miniAppWebApp = config.max.miniAppWebApp?.trim();

    if (!miniAppWebApp) {
      return null;
    }

    if (!miniAppWebApp.startsWith('https://') && !miniAppWebApp.startsWith('http://')) {
      return miniAppWebApp;
    }

    try {
      const url = new URL(miniAppWebApp);
      url.searchParams.set('startapp', payload);
      return url.toString();
    } catch {
      return miniAppWebApp;
    }
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
