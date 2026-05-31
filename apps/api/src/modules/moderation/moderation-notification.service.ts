import { AdStatus, UserRole, UserStatus, type Ad, type PrismaClient } from '@rabst24/db';
import { config, logger } from '@rabst24/config';
import type { MaxApiClient, MaxButton, MaxInlineKeyboardAttachment } from '@rabst24/max-api';

const MODERATION_START_PARAM = 'moderation';

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

    await Promise.allSettled(
      recipients.map(async (recipient) => {
        try {
          await this.maxApiClient.sendMessage({
            userId: recipient.maxUserId,
            disableLinkPreview: true,
            body: {
              text: this.formatMessage(ad),
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

  private formatMessage(ad: Ad): string {
    return [
      'Новое объявление на модерацию',
      '',
      `${this.getTypeLabel(ad.type.toLowerCase())}: ${ad.title}`,
      ad.districtText ? `Район: ${ad.districtText}` : null,
      ad.city ? `Город: ${ad.city}` : null,
      '',
      'Откройте очередь модерации, чтобы проверить и опубликовать.'
    ]
      .filter(Boolean)
      .join('\n');
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
}
