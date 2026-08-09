import type { AdService as CoreAdService } from '@rabst24/core';
import {
  AppError,
  canonicalizeCategory,
  canonicalizeDistrict,
  getVacancyPublicationPaymentAmount,
  getVacancyPublicationPlan,
  requiresVacancyMediaFee,
  VACANCY_MEDIA_FEE_AMOUNT_RUB,
  type AdListQueryDto,
  type CreateAdDto
} from '@rabst24/shared';
import { AdStatus } from '@rabst24/db';
import { logger } from '@rabst24/config';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ModerationNotificationService } from '../moderation/moderation-notification.service.js';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { AdPaymentService } from '../payments/ad-payment.service.js';
import type { CreateVacancyDto } from './vacancies.schemas.js';
import type { VacanciesRepository } from './vacancies.repository.js';

export class VacanciesService extends FoundationService {
  private readonly vacancyCreationLocks = new Map<string, Promise<void>>();

  constructor(
    repository: VacanciesRepository,
    private readonly coreAdService: CoreAdService,
    private readonly moderationNotificationService: ModerationNotificationService,
    private readonly adPaymentService: AdPaymentService,
    private readonly notificationService?: NotificationService
  ) {
    super(repository);
  }

  async listPublic(query: AdListQueryDto) {
    return this.coreAdService.listPublicAds(query, 'vacancy');
  }

  async getPublicDetails(adId: string) {
    return this.coreAdService.getPublicAdDetails(adId, 'vacancy');
  }

  async createForModeration(ownerId: string, dto: CreateVacancyDto) {
    return this.withVacancyCreationLock(ownerId, () => this.createForModerationLocked(ownerId, dto));
  }

  private async createForModerationLocked(ownerId: string, dto: CreateVacancyDto) {
    const categoryText = canonicalizeCategory(dto.categoryText);
    const districtText = canonicalizeDistrict(dto.districtText);
    const publicationBalance = await this.adPaymentService.getVacancyPublicationBalance(ownerId);
    const plan = getVacancyPublicationPlan(dto.publicationPlan);
    const fundingMode = dto.publicationFunding ?? 'auto';
    const usesPackageCredit = fundingMode !== 'buy_package' && publicationBalance.remaining > 0;

    if (fundingMode === 'use_balance' && !usesPackageCredit) {
      throw new AppError('Нет доступных публикаций вакансий', 409, {
        code: 'VACANCY_PUBLICATION_BALANCE_EMPTY',
        ownerId
      });
    }

    const mediaFeeRequired = requiresVacancyMediaFee(dto.photos);
    const requiresPayment = !usesPackageCredit || mediaFeeRequired;
    const paymentAmountValue = getVacancyPublicationPaymentAmount({
      planCode: plan.code,
      usesBalance: usesPackageCredit,
      mediaFeeRequired
    });
    const createDto: CreateAdDto = {
      type: 'vacancy',
      title: dto.title,
      description: dto.description,
      city: dto.city,
      districtText,
      categoryText,
      metadata: {
        address: dto.address,
        salaryText: dto.salaryText,
        mediaHighlight: mediaFeeRequired,
        mediaFeeRequired,
        billing: {
          purpose: 'vacancy_publication',
          source: requiresPayment ? 'payment' : 'credit',
          planCode: plan.code,
          publications: usesPackageCredit ? 0 : plan.publications,
          mediaHighlight: mediaFeeRequired,
          mediaFeeRequired,
          highlightAmountValue: mediaFeeRequired ? VACANCY_MEDIA_FEE_AMOUNT_RUB : undefined,
          paymentAmountValue: requiresPayment ? paymentAmountValue : undefined,
          createdAt: new Date().toISOString()
        }
      },
      photos: dto.photos,
      contacts: dto.contacts,
      requirements: [],
      responsibilities: [],
      benefits: [],
      vacancy: {
        position: dto.title,
        salaryCurrency: 'RUB',
        isSalaryNegotiable: dto.isSalaryNegotiable
      }
    };

    let ad = await this.coreAdService.createAdForModeration(ownerId, createDto, {
      initialStatus: requiresPayment ? this.adPaymentService.getInitialAdStatusForAdType('vacancy') : AdStatus.DRAFT
    });

    logger.info(
      {
        ownerId,
        adId: ad.id,
        fundingMode,
        usesPackageCredit,
        planCode: plan.code,
        publications: usesPackageCredit ? 0 : plan.publications,
        hasPaidMedia: mediaFeeRequired,
        mediaFeeRequired,
        requiresPayment,
        amountValue: requiresPayment ? paymentAmountValue : '0.00'
      },
      '[PAYMENT_REQUEST] vacancy payment decision'
    );

    const payment = await this.adPaymentService.createPaymentForAd(ad);

    if (!payment) {
      ad = await this.adPaymentService.submitVacancyUsingCredit(ad.id, ownerId);
    }

    logger.info(
      {
        ownerId,
        adId: ad.id,
        fundingMode,
        usesPackageCredit,
        planCode: plan.code,
        publications: usesPackageCredit ? 0 : plan.publications,
        hasPaidMedia: mediaFeeRequired,
        mediaFeeRequired,
        paymentRequired: Boolean(payment),
        amountValue: payment ? payment.amount : '0.00'
      },
      '[VACANCY_CREATE] created'
    );

    if (!payment) {
      void this.moderationNotificationService.notifyNewAd(ad, ownerId);
    }

    await this.notifyVacancyCreated(ownerId, ad.id, ad.title, Boolean(payment), payment?.id ?? null);

    return { ad, payment };
  }

  private async withVacancyCreationLock<T>(ownerId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.vacancyCreationLocks.get(ownerId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = previous.catch(() => undefined).then(() => current);

    this.vacancyCreationLocks.set(ownerId, next);
    await previous.catch(() => undefined);

    try {
      return await task();
    } finally {
      release();

      if (this.vacancyCreationLocks.get(ownerId) === next) {
        this.vacancyCreationLocks.delete(ownerId);
      }
    }
  }

  private async notifyVacancyCreated(
    ownerId: string,
    adId: string,
    title: string,
    hasPayment: boolean,
    paymentId: string | null
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    await this.notificationService.notify({
      userId: ownerId,
      type: 'AD_CREATED',
      title: 'Объявление создано',
      body: `Вакансия «${title}» сохранена.`,
      category: 'ad_status',
      idempotencyKey: `ad:${adId}:created`,
      deepLink: this.notificationService.buildMyAdsLink(),
      payload: {
        adId,
        paymentRequired: hasPayment,
        paymentId
      }
    });

    await this.notificationService.notify({
      userId: ownerId,
      type: hasPayment ? 'PAYMENT_CONFIRMED' : 'AD_SUBMITTED_MODERATION',
      title: hasPayment ? 'Требуется оплата' : 'Отправлено на модерацию',
      body: hasPayment ? 'После оплаты вакансия автоматически уйдёт на модерацию.' : `Вакансия «${title}» отправлена на проверку.`,
      category: hasPayment ? 'payments' : 'ad_status',
      critical: true,
      idempotencyKey: hasPayment ? `ad:${adId}:payment-required` : `ad:${adId}:submitted`,
      deepLink: hasPayment ? this.notificationService.buildPaymentLink(paymentId) : this.notificationService.buildMyAdsLink(),
      payload: {
        adId,
        paymentId
      }
    });
  }
}
