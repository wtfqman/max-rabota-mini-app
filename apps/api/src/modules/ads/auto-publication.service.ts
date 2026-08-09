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
import { AppError } from '@rabst24/shared';
import type { AdPaymentService } from '../payments/ad-payment.service.js';

const intervalMs = 10 * 60 * 1000;
const batchSize = 25;

export class AutoPublicationService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: PrismaClient,
    private readonly adService: CoreAdService,
    private readonly channelPublishingService: CoreChannelPublishingService,
    private readonly adPaymentService: AdPaymentService
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
          status: AdStatus.PUBLISHED,
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

    if (!settings.autoRepeatStartedAt) {
      await this.disableAutoRepeat(ad.id, ad.metadataJson, settings);
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

    const latestAd = await this.findAutoPublishableAd(ad.id);
    const latestSettings = latestAd ? getAdPublicationSettings(latestAd.metadataJson) : null;

    if (!latestAd || !latestSettings?.autoRepeat) {
      return;
    }

    if (!latestSettings.autoRepeatStartedAt) {
      await this.disableAutoRepeat(latestAd.id, latestAd.metadataJson, latestSettings);
      return;
    }

    const latestActiveUntil = getActiveUntil(latestSettings);

    if (latestActiveUntil && latestActiveUntil <= now) {
      await this.disableAutoRepeat(latestAd.id, latestAd.metadataJson, latestSettings);
      return;
    }

    const latestLastPublishedAt = await this.getLastPublishedAt(latestAd.id, latestAd.publishedAt);
    const latestNextPublishAt = getNextAutoPublishAt(latestSettings, latestLastPublishedAt);

    if (latestNextPublishAt && latestNextPublishAt > now) {
      return;
    }

    try {
      await this.adPaymentService.assertAdHasFreshSucceededPaymentForPublication(latestAd.id);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 402) {
        await this.disableAutoRepeat(latestAd.id, latestAd.metadataJson, latestSettings);
        logger.warn({ err: error, adId: latestAd.id }, 'Auto publication disabled: payment is required');
        return;
      }

      throw error;
    }

    try {
      const result = await this.channelPublishingService.publishApprovedAd({
        chatId: channelChatId,
        channelUrl: config.channelUrl,
        ad: latestAd
      });

      if (result.status !== 'published') {
        logger.info({ adId: latestAd.id, reason: result.reason }, 'Auto publication skipped');
        return;
      }

      await this.adService.markAdPublished(latestAd.id);
      await this.markAutoPublished(latestAd.id, latestAd.metadataJson, now, latestSettings.repeatPeriod);
      logger.info({ adId: latestAd.id }, 'Auto publication completed');
    } catch (error) {
      logger.error({ err: error, adId: latestAd.id }, 'Auto publication failed');
    }
  }

  private async findAutoPublishableAd(adId: string): Promise<AdWithDetailsRecord | null> {
    return this.db.ad.findFirst({
      where: {
        id: adId,
        status: AdStatus.PUBLISHED,
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        isTest: false,
        metadataJson: {
          contains: '"autoRepeat":true'
        }
      },
      include: adWithDetailsInclude
    });
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
