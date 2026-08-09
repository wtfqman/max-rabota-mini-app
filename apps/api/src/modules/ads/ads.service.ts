import type {
  AdWithDetailsRecord,
  AdService as CoreAdService,
  ChannelPublishingService as CoreChannelPublishingService,
  ChannelPublicationResult
} from '@rabst24/core';
import { AdStatus, AdType } from '@rabst24/db';
import { AppError, getVacancyPublicationPaymentAmount, getVacancyPublicationPlan, type AdListQueryDto } from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ModerationNotificationService } from '../moderation/moderation-notification.service.js';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { AdPaymentService } from '../payments/ad-payment.service.js';
import {
  parseRevisionData,
  parseRevisionMedia,
  type AdRevisionRecord,
  type AdRevisionRepository
} from './ad-revision.repository.js';
import type { AdsRepository } from './ads.repository.js';
import type { OwnedAdsQuery, PublicationSettingsDto, ResubmitAdDto, SaveAdRevisionDto } from './ads.schemas.js';

export class AdsService extends FoundationService {
  private readonly revisionSubmitLocks = new Map<string, Promise<void>>();

  constructor(
    repository: AdsRepository,
    private readonly coreAdService: CoreAdService,
    private readonly channelPublishingService: CoreChannelPublishingService,
    private readonly moderationNotificationService: ModerationNotificationService,
    private readonly adPaymentService: AdPaymentService,
    private readonly adRevisionRepository: AdRevisionRepository,
    private readonly notificationService?: NotificationService
  ) {
    super(repository);
  }

  async listPublic(query: AdListQueryDto) {
    return this.coreAdService.listPublicAds(query);
  }

  async getPublicDetails(adId: string) {
    return this.coreAdService.getPublicAdDetails(adId);
  }

  async listMy(ownerId: string, query: OwnedAdsQuery) {
    await this.adPaymentService.reconcilePendingOwnerPayments(ownerId);

    return this.coreAdService.listOwnerAds(ownerId, query);
  }

  async updateMine(ownerId: string, adId: string, dto: SaveAdRevisionDto) {
    const current = await this.coreAdService.getOwnedAdDetails(ownerId, adId);
    const shouldCreateRevision = this.requiresRevisionAfterOwnerChange(current.status);

    if (shouldCreateRevision) {
      const revision = await this.adRevisionRepository.saveDraft(current, ownerId, dto);

      return {
        ad: current,
        payment: null,
        revision,
        estimate: await this.buildRevisionEstimate(current, revision, {})
      };
    }

    const requiresPaymentOrModeration = this.requiresModerationAfterOwnerChange(current.status);
    const updated = await this.coreAdService.updateOwnerAd(ownerId, adId, dto, {
      statusAfterPublicEdit: requiresPaymentOrModeration ? this.adPaymentService.getInitialAdStatusForAdType(current.type) : undefined
    });

    if (!requiresPaymentOrModeration) {
      return { ad: updated, payment: null };
    }

    await this.channelPublishingService.removeAdPublications(adId);

    if (updated.status === AdStatus.PAYMENT_PENDING) {
      const payment = await this.adPaymentService.createPaymentForAd(updated);
      const refreshed = await this.coreAdService.getOwnedAdDetails(ownerId, adId);

      return { ad: refreshed, payment };
    }

    void this.moderationNotificationService.notifyNewAd(updated, ownerId);
    await this.notifySubmitted(ownerId, updated.id, updated.title);

    return { ad: updated, payment: null };
  }

  async listRevisions(ownerId: string, adId: string) {
    await this.coreAdService.getOwnedAdDetails(ownerId, adId);
    return this.adRevisionRepository.listForAd(adId);
  }

  async cancelActiveRevision(ownerId: string, adId: string) {
    await this.coreAdService.getOwnedAdDetails(ownerId, adId);
    return this.adRevisionRepository.cancel(ownerId, adId);
  }

  async getActiveRevision(adId: string): Promise<AdRevisionRecord | null> {
    return this.adRevisionRepository.findLatestActive(adId);
  }

  async getActiveRevisionEstimate(
    ad: AdWithDetailsRecord,
    revision: AdRevisionRecord | null
  ): Promise<RevisionPublicationEstimate | null> {
    return revision ? this.buildRevisionEstimate(ad, revision, {}) : null;
  }

  async updatePublicationSettings(ownerId: string, adId: string, dto: PublicationSettingsDto) {
    return this.coreAdService.updateOwnerPublicationSettings(ownerId, adId, dto);
  }

  async hideMine(ownerId: string, adId: string) {
    const ad = await this.coreAdService.hideOwnerAd(ownerId, adId);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return { ad, channelRemoval };
  }

  async archiveMine(ownerId: string, adId: string) {
    const ad = await this.coreAdService.archiveOwnerAd(ownerId, adId);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return { ad, channelRemoval };
  }

  async deleteMine(ownerId: string, adId: string) {
    const ad = await this.coreAdService.deleteOwnerAd(ownerId, adId);
    const channelRemoval = await this.channelPublishingService.removeAdPublications(adId);

    return { ad, channelRemoval };
  }

  async resubmitMine(ownerId: string, adId: string, dto: ResubmitAdDto = {}): Promise<{
    ad: AdWithDetailsRecord;
    payment?: Awaited<ReturnType<AdPaymentService['createPaymentForAd']>>;
    publication?: ChannelPublicationResult;
    revision?: AdRevisionRecord;
    estimate?: RevisionPublicationEstimate;
  }> {
    return this.withRevisionSubmitLock(`${ownerId}:${adId}`, async () => {
      await this.adPaymentService.reconcilePendingOwnerPayments(ownerId);

      const current = await this.coreAdService.getOwnedAdDetails(ownerId, adId);

      if (current.status === AdStatus.PENDING_MODERATION) {
        return { ad: current };
      }

      if (current.status === AdStatus.PAYMENT_PENDING) {
        throw new AppError('Payment is required before publication', 402, {
          code: 'PAYMENT_REQUIRED',
          adId
        });
      }

      const activeRevision = await this.adRevisionRepository.findLatestActive(adId);

      if (activeRevision) {
        return this.submitActiveRevision(ownerId, current, activeRevision, dto);
      }

      if (this.canStartVacancyPublicationCycle(current.status)) {
        const revision = await this.adRevisionRepository.saveDraft(current, ownerId, {});
        return this.submitActiveRevision(ownerId, current, revision, dto);
      }

      await this.adPaymentService.assertAdHasFreshSucceededPaymentForPublication(adId);

      const ad = await this.coreAdService.resubmitOwnerAd(ownerId, adId);
      await this.channelPublishingService.removeAdPublications(adId);
      void this.moderationNotificationService.notifyNewAd(ad, ownerId);
      await this.notifySubmitted(ownerId, ad.id, ad.title);

      return { ad };
    });
  }

  private async withRevisionSubmitLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.revisionSubmitLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = previous.catch(() => undefined).then(() => current);

    this.revisionSubmitLocks.set(key, next);
    await previous.catch(() => undefined);

    try {
      return await task();
    } finally {
      release();

      if (this.revisionSubmitLocks.get(key) === next) {
        this.revisionSubmitLocks.delete(key);
      }
    }
  }

  private requiresModerationAfterOwnerChange(status: AdStatus): boolean {
    return status === AdStatus.APPROVED || status === AdStatus.PUBLISHED;
  }

  private requiresRevisionAfterOwnerChange(status: AdStatus): boolean {
    return (
      status === AdStatus.REJECTED ||
      status === AdStatus.APPROVED ||
      status === AdStatus.PUBLISHED ||
      status === AdStatus.HIDDEN ||
      status === AdStatus.ARCHIVED
    );
  }

  private canStartVacancyPublicationCycle(status: AdStatus): boolean {
    return (
      status === AdStatus.REJECTED ||
      status === AdStatus.APPROVED ||
      status === AdStatus.PUBLISHED ||
      status === AdStatus.HIDDEN ||
      status === AdStatus.ARCHIVED
    );
  }

  private async submitActiveRevision(
    ownerId: string,
    current: AdWithDetailsRecord,
    revision: AdRevisionRecord,
    dto: ResubmitAdDto
  ): Promise<{
    ad: AdWithDetailsRecord;
    payment?: Awaited<ReturnType<AdPaymentService['createPaymentForAd']>>;
    publication?: ChannelPublicationResult;
    revision?: AdRevisionRecord;
    estimate?: RevisionPublicationEstimate;
  }> {
    if (revision.status === 'PENDING_MODERATION') {
      return {
        ad: current,
        revision,
        estimate: await this.buildRevisionEstimate(current, revision, dto)
      };
    }

    if (revision.status === 'AWAITING_PAYMENT') {
      return {
        ad: current,
        revision,
        estimate: await this.buildRevisionEstimate(current, revision, dto)
      };
    }

    if (revision.status !== 'DRAFT' && revision.status !== 'REJECTED') {
      throw new AppError('Revision cannot be submitted', 409, {
        code: 'AD_REVISION_NOT_SUBMITTABLE',
        adId: current.id,
        revisionId: revision.id,
        status: revision.status
      });
    }

    if (current.type !== AdType.VACANCY) {
      const submitted = await this.adRevisionRepository.markSubmitted(revision.id);
      void this.moderationNotificationService.notifyNewAd(current, ownerId);
      await this.notifySubmitted(ownerId, current.id, current.title, revision.id);

      return {
        ad: current,
        revision: submitted,
        estimate: await this.buildRevisionEstimate(current, submitted, dto)
      };
    }

    const estimate = await this.buildRevisionEstimate(current, revision, dto);

    if (dto.publicationFunding === 'use_balance' && !estimate.usesBalance) {
      throw new AppError('No vacancy publication credits available', 402, {
        code: 'VACANCY_PUBLICATION_BALANCE_EMPTY',
        ownerId,
        adId: current.id,
        revisionId: revision.id
      });
    }

    if (!estimate.requiresPayment) {
      await this.adPaymentService.consumeVacancyPublicationCreditForRevision(current.id, ownerId);
      const submitted = await this.adRevisionRepository.markSubmitted(revision.id);
      void this.moderationNotificationService.notifyNewAd(current, ownerId);
      await this.notifySubmitted(ownerId, current.id, current.title, revision.id);

      return {
        ad: current,
        revision: submitted,
        estimate
      };
    }

    const payment = await this.adPaymentService.createPaymentForVacancyRevision({
      ad: current,
      revisionId: revision.id,
      publicationPlan: dto.publicationPlan,
      usesBalance: estimate.usesBalance,
      mediaFeeRequired: estimate.mediaFeeRequired
    });

    if (!payment) {
      throw new AppError('Revision payment was expected but was not created', 500, {
        code: 'AD_REVISION_PAYMENT_NOT_CREATED',
        adId: current.id,
        revisionId: revision.id
      });
    }

    const awaitingPayment = await this.adRevisionRepository.markAwaitingPayment(revision.id, payment.id);

    return {
      ad: current,
      payment,
      revision: awaitingPayment,
      estimate
    };
  }

  private async buildRevisionEstimate(
    current: AdWithDetailsRecord,
    revision: AdRevisionRecord,
    dto: ResubmitAdDto
  ): Promise<RevisionPublicationEstimate> {
    if (current.type !== AdType.VACANCY) {
      return {
        usesBalance: false,
        mediaFeeRequired: false,
        requiresPayment: false,
        amount: '0.00',
        remainingBefore: 0,
        remainingAfter: 0
      };
    }

    const balance = await this.adPaymentService.getVacancyPublicationBalance(current.ownerId);
    const data = parseRevisionData(revision.dataJson);
    const media = parseRevisionMedia(revision.mediaJson);
    const mediaFeeRequired = data.mediaChanged && Array.isArray(media) && media.length > 0;
    const fundingMode = dto.publicationFunding ?? 'auto';
    const usesBalance = fundingMode !== 'buy_package' && balance.remaining > 0;
    const requiresPayment = !usesBalance || mediaFeeRequired;

    return {
      usesBalance,
      mediaFeeRequired,
      requiresPayment,
      amount: requiresPayment
        ? getVacancyPublicationPaymentAmount({
            planCode: getVacancyPublicationPlan(dto.publicationPlan).code,
            usesBalance,
            mediaFeeRequired
          })
        : '0.00',
      remainingBefore: balance.remaining,
      remainingAfter: usesBalance ? Math.max(0, balance.remaining - 1) : balance.remaining
    };
  }

  private async notifySubmitted(ownerId: string, adId: string, title: string, revisionId?: string): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    await this.notificationService.notify({
      userId: ownerId,
      type: 'AD_SUBMITTED_MODERATION',
      title: 'Отправлено на модерацию',
      body: `Объявление «${title}» отправлено на проверку.`,
      category: 'ad_status',
      idempotencyKey: revisionId ? `ad:${adId}:revision:${revisionId}:submitted` : `ad:${adId}:submitted`,
      deepLink: this.notificationService.buildMyAdsLink(),
      payload: {
        adId,
        revisionId
      }
    });
  }
}

export interface RevisionPublicationEstimate {
  usesBalance: boolean;
  mediaFeeRequired: boolean;
  requiresPayment: boolean;
  amount: string;
  remainingBefore: number;
  remainingAfter: number;
}
