import { AdStatus, ChannelPublishStatus, type PrismaClient } from '@rabst24/db';
import { config, getResolvedMaxChannelChatId, logger } from '@rabst24/config';
import {
  adWithDetailsInclude,
  getActiveUntil,
  getAdPublicationSettings,
  getNextAutoPublishAt,
  mergeAdPublicationSettings,
  type AdWithDetailsRecord,
  type AdService as CoreAdService,
  type ChannelPublishingService as CoreChannelPublishingService
} from '@rabst24/core';

const intervalMs = 10 * 60 * 1000;
const batchSize = 25;

export class AutoPublicationService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: PrismaClient,
    private readonly adService: CoreAdService,
    private readonly channelPublishingService: CoreChannelPublishingService
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.runSafely();
    }, intervalMs);
    this.timer.unref?.();
    this.runSafely();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  async processDueAds(now = new Date()): Promise<void> {
    if (this.running) {
      return;
    }

    const channelChatId = getResolvedMaxChannelChatId();

    if (!channelChatId) {
      logger.warn('Auto publication skipped: MAX channel chat id is not configured');
      return;
    }

    this.running = true;

    try {
      const ads = await this.db.ad.findMany({
        where: {
          status: {
            in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
          },
          deletedAt: null,
          hiddenAt: null,
          archivedAt: null,
          isTest: false,
          metadataJson: {
            contains: '"autoRepeat":true'
          }
        },
        include: adWithDetailsInclude,
        orderBy: [
          {
            publishedAt: 'asc'
          },
          {
            updatedAt: 'asc'
          }
        ],
        take: batchSize
      });

      for (const ad of ads) {
        await this.processAd(ad, channelChatId, now);
      }
    } finally {
      this.running = false;
    }
  }

  private runSafely(): void {
    void this.processDueAds().catch((error) => {
      logger.error({ err: error }, 'Auto publication scan failed');
    });
  }

  private async processAd(
    ad: AdWithDetailsRecord,
    channelChatId: string,
    now: Date
  ): Promise<void> {
    const settings = getAdPublicationSettings(ad.metadataJson);

    if (!settings?.autoRepeat) {
      return;
    }

    const activeUntil = getActiveUntil(settings);

    if (activeUntil && activeUntil <= now) {
      await this.disableAutoRepeat(ad.id, ad.metadataJson, settings);
      return;
    }

    const lastPublishedAt = await this.getLastPublishedAt(ad.id, ad.publishedAt);
    const nextPublishAt = getNextAutoPublishAt(settings, lastPublishedAt);

    if (nextPublishAt && nextPublishAt > now) {
      return;
    }

    try {
      await this.channelPublishingService.publishApprovedAd({
        chatId: channelChatId,
        channelUrl: config.channelUrl,
        ad
      });
      await this.adService.markAdPublished(ad.id);
      await this.markAutoPublished(ad.id, ad.metadataJson, now, settings.repeatPeriod);
      logger.info({ adId: ad.id }, 'Auto publication completed');
    } catch (error) {
      logger.error({ err: error, adId: ad.id }, 'Auto publication failed');
    }
  }

  private async getLastPublishedAt(adId: string, fallback: Date | null): Promise<Date | null> {
    const lastLog = await this.db.channelPublishLog.findFirst({
      where: {
        adId,
        status: ChannelPublishStatus.PUBLISHED,
        publishedAt: {
          not: null
        }
      },
      orderBy: {
        publishedAt: 'desc'
      },
      select: {
        publishedAt: true
      }
    });

    return lastLog?.publishedAt ?? fallback;
  }

  private async disableAutoRepeat(
    adId: string,
    metadataJson: string | null,
    settings: NonNullable<ReturnType<typeof getAdPublicationSettings>>
  ): Promise<void> {
    await this.db.ad.update({
      where: {
        id: adId
      },
      data: {
        metadataJson: mergeAdPublicationSettings(metadataJson, {
          ...settings,
          autoRepeat: false
        })
      }
    });
  }

  private async markAutoPublished(
    adId: string,
    metadataJson: string | null,
    now: Date,
    repeatPeriod: NonNullable<ReturnType<typeof getAdPublicationSettings>>['repeatPeriod']
  ): Promise<void> {
    const nextAutoPublishAt = getNextAutoPublishAt(
      {
        ...(getAdPublicationSettings(metadataJson) ?? {
          autoRepeat: true,
          repeatPeriod,
          activePeriod: 'manual',
          remindBeforeEnd: false,
          updatedAt: now.toISOString(),
          autoRepeatStartedAt: now.toISOString(),
          lastAutoPublishedAt: null,
          nextAutoPublishAt: null
        }),
        repeatPeriod
      },
      now
    );

    await this.db.ad.update({
      where: {
        id: adId
      },
      data: {
        metadataJson: mergeAdPublicationSettings(metadataJson, {
          lastAutoPublishedAt: now.toISOString(),
          nextAutoPublishAt: nextAutoPublishAt?.toISOString() ?? null
        })
      }
    });
  }
}
