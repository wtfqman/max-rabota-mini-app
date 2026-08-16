import { config, getResolvedMaxChannelChatId, logger } from '@rabst24/config';
import { AdStatus, AdType } from '@rabst24/db';
import { AppError } from '@rabst24/shared';
import type {
  AdService as CoreAdService,
  ChannelPublishingService,
  ModerationLogRepository,
  ModerationService as CoreModerationService
} from '@rabst24/core';
import { FoundationService } from '../../shared/modules/module-status.js';
import { parseRevisionData, type AdRevisionRepository, type AdRevisionRecord } from '../ads/ad-revision.repository.js';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { AdPaymentService } from '../payments/ad-payment.service.js';
import type { SavedSearchesService } from '../saved-searches/saved-searches.service.js';
import type { ModerationQueueQuery } from './moderation.schemas.js';
import type { ModerationRepository } from './moderation.repository.js';

export class ModerationModuleService extends FoundationService {
  constructor(
    repository: ModerationRepository,
    private readonly adService: CoreAdService,
    private readonly moderationService: CoreModerationService,
    private readonly moderationLogRepository: ModerationLogRepository,
    private readonly channelPublishingService: ChannelPublishingService,
    private readonly adPaymentService: AdPaymentService,
    private readonly adRevisionRepository?: AdRevisionRepository,
    private readonly notificationService?: NotificationService,
    private readonly savedSearchesService?: SavedSearchesService,
    private readonly telegramSyncService?: {
      enqueuePublicationForAd(adId: string, source?: 'max' | 'telegram' | 'rabst24'): Promise<unknown>;
      removePublicationsForAd(adId: string): Promise<unknown>;
    }
  ) {
    super(repository);
  }

  async listQueue(query: ModerationQueueQuery) {
    return this.adService.listModerationQueue(query);
  }

  async getPreview(adId: string) {
    return this.adService.getModerationAdDetails(adId);
  }

  async getPendingRevision(adId: string) {
    return this.adRevisionRepository?.findLatestPendingModeration(adId) ?? null;
  }

  async approve(adId: string, moderatorId: string) {
    await this.adPaymentService.assertAdHasFreshSucceededPaymentForPublication(adId);

    if (this.adRevisionRepository) {
      const revision = await this.adRevisionRepository.findLatestPendingModeration(adId);

      if (revision) {
        const current = await this.adService.getAdDetails(adId);
        this.assertRevisionCanBeApproved(current, revision);
        await this.adRevisionRepository.approvePending(adId, moderatorId);
        await this.channelPublishingService.removeAdPublications(adId);
        await this.removeTelegramPublications(adId);
        const publishedAd = await this.adService.markAdPublished(adId);
        const publication = await this.publishAfterApprove(publishedAd);
        await this.enqueueTelegramPublication(publishedAd.id);
        await this.notifyApproved(publishedAd, true);
        await this.enqueueSavedSearchScan(publishedAd.id);

        return {
          ad: publishedAd,
          publication
        };
      }
    }

    await this.moderationService.approveAd(adId, moderatorId);
    const publishedAd = await this.adService.markAdPublished(adId);
    const publication = await this.publishAfterApprove(publishedAd);
    await this.enqueueTelegramPublication(publishedAd.id);
    await this.notifyApproved(publishedAd, true);
    await this.enqueueSavedSearchScan(publishedAd.id);

    return {
      ad: publishedAd,
      publication
    };
  }

  async reject(adId: string, moderatorId: string, reason: string) {
    const current = await this.adService.getAdDetails(adId);

    if (this.adRevisionRepository) {
      const revision = await this.adRevisionRepository.findLatestPendingModeration(adId);

      if (revision) {
        await this.adRevisionRepository.rejectPending(adId, reason);
        const creditReturn =
          current.type === AdType.VACANCY ? await this.safeReturnVacancyPublicationCredit(adId) : { returned: false, reason: 'not_vacancy' };
        const refund = revision.paymentId
          ? await this.safeRefundRejectedVacancyPayment(revision.paymentId, adId, reason)
          : {
              status: 'skipped' as const,
              reason: 'revision_no_payment'
            };
        const rejectedAd = await this.adService.getAdDetails(adId);
        await this.notifyRejected(rejectedAd, reason);

        return {
          ad: rejectedAd,
          channelRemoval: {
            attempted: 0,
            removed: 0,
            failed: 0,
            skipped: 0
          },
          telegramRemoval: {
            attempted: 0,
            deleted: 0,
            failed: 0,
            skipped: 0
          },
          creditReturn,
          refund
        };
      }
    }

    if (current.status !== AdStatus.REJECTED) {
      await this.moderationService.rejectAd(adId, moderatorId, reason);
    }

    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);
    const telegramRemoval = await this.removeTelegramPublications(adId);
    const creditReturn = await this.safeReturnVacancyPublicationCredit(adId);
    const refund = await this.safeRefundRejectedVacancy(adId, reason);
    const rejectedAd = await this.adService.getAdDetails(adId);
    await this.notifyRejected(rejectedAd, reason);

    return {
      ad: rejectedAd,
      channelRemoval,
      telegramRemoval,
      creditReturn,
      refund
    };
  }

  async hide(adId: string, moderatorId: string, reason?: string) {
    await this.moderationService.hideAd(adId, moderatorId, reason);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);
    const telegramRemoval = await this.removeTelegramPublications(adId);

    return {
      ad: await this.adService.getAdDetails(adId),
      channelRemoval,
      telegramRemoval
    };
  }

  async unpublish(adId: string, moderatorId: string, reason?: string) {
    await this.moderationService.unpublishAd(adId, moderatorId, reason);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);
    const telegramRemoval = await this.removeTelegramPublications(adId);

    return {
      ad: await this.adService.getAdDetails(adId),
      channelRemoval,
      telegramRemoval
    };
  }

  async archive(adId: string, moderatorId: string, reason?: string) {
    await this.moderationService.archiveAd(adId, moderatorId, reason);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);
    const telegramRemoval = await this.removeTelegramPublications(adId);

    return {
      ad: await this.adService.getAdDetails(adId),
      channelRemoval,
      telegramRemoval
    };
  }

  async delete(adId: string, moderatorId: string, reason?: string) {
    await this.moderationService.deleteAd(adId, moderatorId, reason);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);
    const telegramRemoval = await this.removeTelegramPublications(adId);

    return {
      ad: await this.adService.getAdDetails(adId),
      channelRemoval,
      telegramRemoval
    };
  }

  async removeFromChannel(adId: string, moderatorId: string) {
    await this.moderationService.logChannelRemoved(adId, moderatorId, 'Снятие публикации из канала');
    const ad = await this.adService.disableAutoRepeat(adId);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);
    const telegramRemoval = await this.removeTelegramPublications(adId);

    return {
      ad,
      channelRemoval,
      telegramRemoval
    };
  }

  async listLogs(query: { page: number; perPage: number; adId?: string; moderatorId?: string }) {
    return this.moderationLogRepository.list(query);
  }

  private async notifyApproved(ad: Awaited<ReturnType<CoreAdService['getAdDetails']>>, published: boolean): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    await this.notificationService.notify({
      userId: ad.owner.id,
      type: 'AD_APPROVED',
      title: 'Объявление одобрено',
      body: `Объявление «${ad.title}» прошло модерацию.`,
      category: 'ad_status',
      idempotencyKey: `ad:${ad.id}:approved`,
      deepLink: this.notificationService.buildAdLink(ad.id, ad.type),
      payload: {
        adId: ad.id,
        status: ad.status
      }
    });

    if (published) {
      await this.notificationService.notify({
        userId: ad.owner.id,
        type: 'AD_PUBLISHED',
        title: 'Объявление опубликовано',
        body: `Объявление «${ad.title}» опубликовано в ленте.`,
        category: 'ad_status',
        idempotencyKey: `ad:${ad.id}:published:${ad.publishedAt ?? 'now'}`,
        deepLink: this.notificationService.buildAdLink(ad.id, ad.type),
        payload: {
          adId: ad.id,
          publishedAt: ad.publishedAt
        }
      });
    }
  }

  private assertRevisionCanBeApproved(
    current: Awaited<ReturnType<CoreAdService['getAdDetails']>>,
    revision: AdRevisionRecord
  ): void {
    if (current.type !== AdType.RESUME) {
      return;
    }

    const data = parseRevisionData(revision.dataJson);
    const hasManualContact = (data.contacts ?? []).some((contact) => contact.value.trim().length >= 3);
    const hasVerifiedContact = Boolean(current.resumeDetails?.verifiedContactId && current.resumeDetails.contactConsentId);
    const hasOwnerMaxContact = Boolean(current.owner?.maxUsername?.trim());

    if (hasManualContact || hasVerifiedContact || hasOwnerMaxContact) {
      return;
    }

    throw new AppError('Resume contact is required before approval', 400, {
      code: 'RESUME_CONTACT_REQUIRED',
      adId: current.id,
      revisionId: revision.id
    });
  }

  private async enqueueSavedSearchScan(adId: string): Promise<void> {
    if (!this.savedSearchesService) {
      return;
    }

    try {
      await this.savedSearchesService.enqueueScanForAd(adId);
    } catch (error) {
      logger.warn({ err: error, adId }, 'Failed to enqueue saved search scan');
    }
  }

  private async enqueueTelegramPublication(adId: string): Promise<void> {
    if (!this.telegramSyncService) {
      return;
    }

    try {
      await this.telegramSyncService.enqueuePublicationForAd(adId, 'rabst24');
    } catch (error) {
      logger.warn({ err: error, adId }, 'Failed to enqueue Telegram publication');
    }
  }

  private async removeTelegramPublications(adId: string): Promise<unknown> {
    if (!this.telegramSyncService) {
      return {
        attempted: 0,
        deleted: 0,
        failed: 0,
        skipped: 0
      };
    }

    try {
      return await this.telegramSyncService.removePublicationsForAd(adId);
    } catch (error) {
      logger.warn({ err: error, adId }, 'Failed to remove Telegram publications');
      return {
        attempted: 0,
        deleted: 0,
        failed: 1,
        skipped: 0
      };
    }
  }

  private async notifyRejected(ad: Awaited<ReturnType<CoreAdService['getAdDetails']>>, reason: string): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    await this.notificationService.notify({
      userId: ad.owner.id,
      type: 'AD_REJECTED',
      title: 'Объявление отклонено',
      body: reason ? `Причина отказа: ${reason}` : `Объявление «${ad.title}» отклонено.`,
      category: 'ad_status',
      idempotencyKey: `ad:${ad.id}:rejected:${reason}`,
      deepLink: this.notificationService.buildMyAdsLink(),
      payload: {
        adId: ad.id,
        reason
      }
    });
  }

  private async publishAfterApprove(ad: Awaited<ReturnType<CoreAdService['getAdDetails']>>) {
    const channelChatId = getResolvedMaxChannelChatId();

    if (!channelChatId) {
      await this.channelPublishingService.enqueueAdPublication({
        adId: ad.id,
        channelUrl: config.channelUrl,
        payload: {
          skippedReason: 'MAX_CHANNEL_CHAT_ID is not configured'
        },
        publishedText: null
      });

      return {
        status: 'skipped' as const,
        reason: 'MAX_CHANNEL_CHAT_ID is not configured'
      };
    }

    try {
      const result = await this.channelPublishingService.publishApprovedAd({
        chatId: channelChatId,
        channelUrl: config.channelUrl,
        ad
      });

      if (result.status === 'skipped') {
        return {
          status: 'skipped' as const,
          reason: result.reason,
          logId: result.logId
        };
      }

      return {
        status: 'published' as const,
        logId: result.logId,
        mediaStrategy: result.mediaStrategy
      };
    } catch (error) {
      logger.error({ err: error, adId: ad.id }, 'Channel publication after moderation failed');

      return {
        status: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown publication error'
      };
    }
  }

  private async safeReturnVacancyPublicationCredit(adId: string) {
    try {
      return await this.adPaymentService.returnVacancyPublicationCredit(adId);
    } catch (error) {
      logger.error(
        {
          err: error,
          adId
        },
        '[PAYMENT_FAILED] failed to return vacancy publication credit after rejection'
      );

      return {
        returned: false,
        reason: 'credit_return_failed'
      };
    }
  }

  private async safeRefundRejectedVacancy(adId: string, reason: string) {
    try {
      return await this.adPaymentService.refundLatestSucceededAdPayment(adId, reason);
    } catch (error) {
      logger.error(
        {
          err: error,
          adId
        },
        '[PAYMENT_FAILED] failed to refund rejected vacancy payment'
      );

      return {
        status: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown refund error'
      };
    }
  }

  private async safeRefundRejectedVacancyPayment(paymentRecordId: string, adId: string, reason: string) {
    try {
      return await this.adPaymentService.refundSucceededAdPayment(paymentRecordId, reason);
    } catch (error) {
      logger.error(
        {
          err: error,
          adId,
          paymentRecordId
        },
        '[PAYMENT_FAILED] failed to refund rejected vacancy revision payment'
      );

      return {
        status: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown refund error'
      };
    }
  }

}
