import { randomUUID } from 'node:crypto';
import {
  AdStatus,
  AdType,
  ChannelPublishStatus,
  ContactAccessMode,
  ContactAccessStatus,
  ContactStatus,
  ModerationAction,
  PaymentStatus,
  PromotionProductType,
  UserStatus,
  VacancyPublicationGrantSource,
  VacancyPublicationUsageSource,
  type Ad,
  type Prisma,
  type PrismaClient
} from '@rabst24/db';
import {
  AppError,
  VACANCY_MEDIA_FEE_AMOUNT_RUB,
  classifyVacancyPaymentPurpose,
  getPaymentPurposeEffects,
  getRejectedVacancyRefundPolicy,
  getVacancyPublicationPaymentAmount,
  getVacancyPublicationPlan,
  normalizePaymentPurpose,
  isValidPaymentConfirmationUrl,
  requiresVacancyMediaFee,
  requiresAdPayment,
  type PaymentPurposeClassification,
  type VacancyPublicationFundingMode,
  type VacancyPublicationPlanCode
} from '@rabst24/shared';
import { logger } from '@rabst24/config';
import type { AdAnalyticsService } from '../ad-analytics/ad-analytics.service.js';
import type { ModerationNotificationService } from '../moderation/moderation-notification.service.js';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { YooKassaClient, YooKassaPayment, YooKassaRefund } from './yookassa-client.js';

const AD_PAYMENT_PURPOSE = 'ad_placement';
const VACANCY_PUBLICATION_PURPOSE = 'vacancy_publication';

interface VacancyBillingMetadata {
  purpose?: string;
  source?: 'payment' | 'credit';
  planCode?: VacancyPublicationPlanCode;
  publications?: number;
  mediaHighlight?: boolean;
  mediaFeeRequired?: boolean;
  highlightAmountValue?: string;
  paymentAmountValue?: string;
}

export interface VacancyRepublishRequest {
  publicationPlan?: VacancyPublicationPlanCode;
  publicationFunding?: VacancyPublicationFundingMode;
}

export interface VacancyRevisionPaymentRequest {
  ad: Ad;
  revisionId: string;
  publicationPlan?: VacancyPublicationPlanCode;
  usesBalance: boolean;
  mediaFeeRequired: boolean;
}

export interface AdPaymentSettings {
  enabled: boolean;
  amountValue: string;
  currency: string;
  returnUrl: string;
  testMode: boolean;
}

export interface AdPaymentPayload {
  id: string;
  paymentId: string;
  status: string;
  amount: string;
  currency: string;
  confirmationUrl: string | null;
  test: boolean;
}

export interface AdPaymentRefundResult {
  status: 'skipped' | 'pending' | 'refunded' | 'failed';
  refundId?: string;
  reason?: string;
  error?: string;
}

export interface AdPaymentReconcileResult {
  checked: number;
  succeeded: number;
  canceled: number;
  waiting: number;
  failed: number;
}

export interface VacancyPublicationBalance {
  purchased: number;
  bonus: number;
  used: number;
  remaining: number;
}

type BalanceRecord = VacancyPublicationBalance & { userId: string };

type YooKassaNotification =
  | {
      kind: 'payment';
      event: 'payment.waiting_for_capture' | 'payment.succeeded' | 'payment.canceled';
      paymentId: string;
    }
  | {
      kind: 'refund';
      event: 'refund.succeeded';
      refund: YooKassaRefund;
    };

interface PaymentSucceededNotificationContext {
  adForModeration: Ad | null;
  ownerId: string;
  adId: string;
  adType: AdType;
  adTitle: string;
  paymentRecordId: string;
  amountValue: string;
  packagePublications: number;
  paymentEffects: ReturnType<typeof getPaymentPurposeEffects>;
  resumeUnlock: {
    id: string;
    buyerUserId: string;
    resumeAdId: string;
    resumeTitle: string;
  } | null;
  referralReward: {
    referralId: string;
    referrerId: string;
  } | null;
  promotionActivated: {
    id: string;
    productType: PromotionProductType;
    endsAt: Date | null;
  } | null;
}

export class AdPaymentService {
  constructor(
    private readonly db: PrismaClient,
    private readonly yooKassaClient: YooKassaClient,
    private readonly settings: AdPaymentSettings,
    private readonly moderationNotificationService: ModerationNotificationService,
    private readonly adRevisionRepository?: {
      markSubmittedByPaymentId(paymentId: string): Promise<unknown>;
    },
    private readonly notificationService?: NotificationService,
    private readonly adAnalyticsService?: AdAnalyticsService
  ) {}

  isPaymentRequired(): boolean {
    return this.settings.enabled && Number(this.settings.amountValue) > 0;
  }

  isPaymentRequiredForAd(ad: Pick<Ad, 'type' | 'metadataJson'>): boolean {
    if (!requiresAdPayment(ad.type)) {
      return false;
    }

    return this.getVacancyBillingMetadata(ad.metadataJson)?.source !== 'credit';
  }

  getInitialAdStatus(): AdStatus {
    return this.isPaymentRequired() ? AdStatus.PAYMENT_PENDING : AdStatus.PENDING_MODERATION;
  }

  getInitialAdStatusForAdType(type: AdType | 'vacancy' | 'resume' | 'equipment' | 'material' | 'tool'): AdStatus {
    return requiresAdPayment(type) ? AdStatus.PAYMENT_PENDING : AdStatus.PENDING_MODERATION;
  }

  async assertAdHasFreshSucceededPaymentForPublication(adId: string): Promise<void> {
    const adForPaymentRule = await this.db.ad.findUnique({
      where: {
        id: adId
      },
      select: {
        id: true,
        type: true,
        ownerId: true,
        metadataJson: true,
        publishedAt: true
      }
    });

    if (!adForPaymentRule) {
      throw new AppError('Ad not found', 404, { adId });
    }

    if (!requiresAdPayment(adForPaymentRule.type)) {
      return;
    }

    const billing = this.getVacancyBillingMetadata(adForPaymentRule.metadataJson);
    const mediaFeeRequired = billing?.mediaFeeRequired === true || billing?.mediaHighlight === true;
    const requiresSucceededPayment = billing?.source !== 'credit' || mediaFeeRequired;
    const [latestSucceededPayment, latestPublication, latestActiveUsage] = await this.db.$transaction([
      this.db.adPayment.findFirst({
        where: {
          adId,
          status: PaymentStatus.SUCCEEDED,
          refundedAt: null,
          ...(mediaFeeRequired ? { includesMediaHighlight: true } : {})
        },
        orderBy: [
          {
            paidAt: 'desc'
          },
          {
            createdAt: 'desc'
          }
        ],
        select: {
          id: true,
          paidAt: true,
          createdAt: true
        }
      }),
      this.db.channelPublishLog.findFirst({
        where: {
          adId,
          status: ChannelPublishStatus.PUBLISHED,
          publishedAt: {
            not: null
          }
        },
        orderBy: [
          {
            publishedAt: 'desc'
          },
          {
            createdAt: 'desc'
          }
        ],
        select: {
          id: true,
          publishedAt: true,
          createdAt: true
        }
      }),
      this.db.vacancyPublicationUsage.findFirst({
        where: {
          adId,
          returnedAt: null
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          id: true,
          createdAt: true,
          returnedAt: true
        }
      })
    ]);

    let activeUsage = latestActiveUsage && !latestActiveUsage.returnedAt ? latestActiveUsage : null;

    if (!activeUsage && requiresSucceededPayment && latestSucceededPayment) {
      await this.backfillPaidVacancyUsage(adForPaymentRule.ownerId, adId);
      activeUsage = await this.db.vacancyPublicationUsage.findFirst({
        where: {
          adId,
          returnedAt: null
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          id: true,
          createdAt: true,
          returnedAt: true
        }
      });
    }

    if (!activeUsage) {
      throw new AppError('A paid publication credit is required before moderation', 402, {
        code: 'VACANCY_PUBLICATION_CREDIT_REQUIRED',
        adId
      });
    }

    if (requiresSucceededPayment && !latestSucceededPayment) {
      throw new AppError('Payment is required before publication', 402, {
        code: 'PAYMENT_REQUIRED',
        adId
      });
    }

    if (requiresSucceededPayment && latestSucceededPayment) {
      const paidAt = latestSucceededPayment.paidAt ?? latestSucceededPayment.createdAt;
      const lastPublicationAt = this.getLatestPublicationDate(
        adForPaymentRule.publishedAt,
        latestPublication?.publishedAt ?? null,
        latestPublication?.createdAt ?? null
      );

      if (lastPublicationAt && paidAt <= lastPublicationAt) {
        throw new AppError('A new payment is required before repeat publication', 402, {
          code: 'PAYMENT_REQUIRED_FOR_REPEAT_PUBLICATION',
          adId,
          latestPaymentId: latestSucceededPayment.id,
          lastPublicationAt: lastPublicationAt.toISOString()
        });
      }
    }

    const lastPublicationAt = this.getLatestPublicationDate(
      adForPaymentRule.publishedAt,
      latestPublication?.publishedAt ?? null,
      latestPublication?.createdAt ?? null
    );

    if (lastPublicationAt && activeUsage.createdAt <= lastPublicationAt) {
      throw new AppError('A new vacancy publication credit is required before repeat publication', 402, {
        code: 'VACANCY_PUBLICATION_CREDIT_REQUIRED_FOR_REPEAT_PUBLICATION',
        adId,
        usageId: activeUsage.id,
        lastPublicationAt: lastPublicationAt.toISOString()
      });
    }
  }

  async createPaymentForAd(ad: Ad): Promise<AdPaymentPayload | null> {
    if (!requiresAdPayment(ad.type)) {
      return null;
    }

    const hasPaidMedia = await this.hasPaidMediaForAd(ad.id);
    const billing = this.getVacancyBillingMetadata(ad.metadataJson);

    if (billing?.source === 'credit' && !hasPaidMedia) {
      return null;
    }

    if (!this.isPaymentRequired()) {
      throw new AppError('YooKassa payment is required for vacancy publication but is not configured', 503, {
        code: 'YOOKASSA_NOT_CONFIGURED',
        adId: ad.id
      });
    }

    if (ad.status !== AdStatus.PAYMENT_PENDING) {
      throw new AppError('Ad must be waiting for payment before YooKassa payment creation', 409, {
        adId: ad.id,
        status: ad.status.toLowerCase()
      });
    }

    const idempotenceKey = randomUUID();
    const amountValue = this.getPaymentAmountValue(ad.metadataJson, hasPaidMedia);
    const packagePublications = this.getBillingPackagePublications(billing);
    const includesMediaFee = billing?.mediaFeeRequired === true || billing?.mediaHighlight === true || hasPaidMedia;
    const paymentType = this.getPaymentType(packagePublications, includesMediaFee);
    const purposeClassification = classifyVacancyPaymentPurpose({
      packagePublications,
      includesMediaFee
    });

    logger.info(
      {
        adId: ad.id,
        ownerId: ad.ownerId,
        amountValue,
        currency: this.settings.currency,
        packagePublications,
        includesMediaFee,
        paymentType,
        returnUrl: this.settings.returnUrl,
        testMode: this.settings.testMode
      },
      '[PAYMENT_REQUEST] requesting YooKassa payment'
    );

    let payment: YooKassaPayment;

    try {
      payment = await this.yooKassaClient.createPayment(
        {
          amount: {
            value: amountValue,
            currency: this.settings.currency
          },
          capture: true,
          confirmation: {
            type: 'redirect',
            return_url: this.settings.returnUrl
          },
          description: `Vacancy publication ${ad.id}`,
          metadata: {
            purpose: AD_PAYMENT_PURPOSE,
            product: VACANCY_PUBLICATION_PURPOSE,
            paymentType,
            paymentPurpose: purposeClassification.primary,
            paymentPurposeComponents: purposeClassification.components.join(','),
            adId: ad.id,
            ownerId: ad.ownerId,
            packagePublications: String(packagePublications),
            includesMediaHighlight: String(includesMediaFee),
            includesMediaFee: String(includesMediaFee)
          },
          receipt: {
            customer: {
              email: 'payments@rabst24.ru'
            },
            items: [
              {
                description: 'Размещение вакансии Rabst24',
                quantity: '1.00',
                amount: {
                  value: amountValue,
                  currency: this.settings.currency
                },
                vat_code: 1,
                payment_mode: 'full_prepayment',
                payment_subject: 'service'
              }
            ]
          }
        },
        idempotenceKey
      );
    } catch (error) {
      logger.error(
        {
          adId: ad.id,
          ownerId: ad.ownerId,
          amountValue,
          packagePublications,
          includesMediaFee,
          error: error instanceof Error ? error.message : String(error)
        },
        '[PAYMENT_FAILED] YooKassa payment creation failed'
      );
      throw error;
    }

    const confirmationUrl = payment.confirmation?.confirmation_url?.trim() ?? null;

    logger.info(
      {
        adId: ad.id,
        paymentId: payment.id,
        status: payment.status,
        amountValue: payment.amount.value,
        currency: payment.amount.currency,
        hasConfirmationUrl: Boolean(confirmationUrl)
      },
      '[PAYMENT_CONFIRMATION_URL] YooKassa payment response received'
    );

    this.assertYooKassaEnvironmentMatches(payment, {
      operation: 'create',
      paymentId: payment.id,
      adId: ad.id
    });

    if (payment.status === 'pending' && !isValidPaymentConfirmationUrl(confirmationUrl)) {
      logger.error(
        {
          adId: ad.id,
          ownerId: ad.ownerId,
          paymentId: payment.id,
          status: payment.status,
          hasConfirmationUrl: Boolean(confirmationUrl)
        },
        '[PAYMENT_FAILED] YooKassa returned an invalid payment confirmation URL'
      );
      throw new AppError('YooKassa did not return a valid payment confirmation URL', 502, {
        code: 'YOOKASSA_CONFIRMATION_URL_INVALID',
        paymentId: payment.id,
        hasConfirmationUrl: Boolean(confirmationUrl)
      });
    }

    const dbPayment = await this.db.adPayment.create({
      data: {
        adId: ad.id,
        yooKassaPaymentId: payment.id,
        idempotenceKey,
        status: this.mapPaymentStatus(payment.status),
        amountValue: payment.amount.value,
        currency: payment.amount.currency,
        confirmationUrl,
        paidAt: payment.status === 'succeeded' && payment.paid ? new Date() : undefined,
        rawPayloadJson: JSON.stringify(payment),
        purposeCode: purposeClassification.primary,
        purposeComponentsJson: JSON.stringify(purposeClassification.components),
        packagePublications,
        includesMediaHighlight: includesMediaFee
      } as never
    });

    logger.info(
      {
        adId: ad.id,
        ownerId: ad.ownerId,
        paymentId: dbPayment.yooKassaPaymentId,
        amountValue: dbPayment.amountValue,
        currency: dbPayment.currency,
        status: dbPayment.status.toLowerCase(),
        hasConfirmationUrl: Boolean(dbPayment.confirmationUrl)
      },
      '[PAYMENT_CREATED] created YooKassa payment'
    );

    return {
      id: dbPayment.id,
      paymentId: dbPayment.yooKassaPaymentId,
      status: dbPayment.status.toLowerCase(),
      amount: dbPayment.amountValue,
      currency: dbPayment.currency,
      confirmationUrl: dbPayment.confirmationUrl,
      test: payment.test ?? this.settings.testMode
    };
  }

  async createPaymentForVacancyRevision(input: VacancyRevisionPaymentRequest): Promise<AdPaymentPayload | null> {
    const plan = getVacancyPublicationPlan(input.publicationPlan);
    const packagePublications = input.usesBalance ? 0 : plan.publications;
    const amountValue = getVacancyPublicationPaymentAmount({
      planCode: plan.code,
      usesBalance: input.usesBalance,
      mediaFeeRequired: input.mediaFeeRequired
    });

    if (Number(amountValue) <= 0) {
      return null;
    }

    if (!this.isPaymentRequired()) {
      throw new AppError('YooKassa payment is required for vacancy revision publication but is not configured', 503, {
        code: 'YOOKASSA_NOT_CONFIGURED',
        adId: input.ad.id,
        revisionId: input.revisionId
      });
    }

    const idempotenceKey = randomUUID();
    const purposeClassification = classifyVacancyPaymentPurpose({
      packagePublications,
      includesMediaFee: input.mediaFeeRequired
    });
    const paymentType = this.getPaymentType(packagePublications, input.mediaFeeRequired);

    const payment = await this.yooKassaClient.createPayment(
      {
        amount: {
          value: amountValue,
          currency: this.settings.currency
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: this.settings.returnUrl
        },
        description: `Vacancy revision publication ${input.ad.id}`,
        metadata: {
          purpose: AD_PAYMENT_PURPOSE,
          product: VACANCY_PUBLICATION_PURPOSE,
          paymentType,
          revisionId: input.revisionId,
          adId: input.ad.id,
          ownerId: input.ad.ownerId,
          packagePublications: String(packagePublications),
          includesMediaHighlight: String(input.mediaFeeRequired),
          includesMediaFee: String(input.mediaFeeRequired),
          paymentPurpose: purposeClassification.primary,
          paymentPurposeComponents: purposeClassification.components.join(',')
        },
        receipt: {
          customer: {
            email: 'payments@rabst24.ru'
          },
          items: [
            {
              description: 'Повторная публикация вакансии Rabst24',
              quantity: '1.00',
              amount: {
                value: amountValue,
                currency: this.settings.currency
              },
              vat_code: 1,
              payment_mode: 'full_prepayment',
              payment_subject: 'service'
            }
          ]
        }
      },
      idempotenceKey
    );

    const confirmationUrl = payment.confirmation?.confirmation_url?.trim() ?? null;

    this.assertYooKassaEnvironmentMatches(payment, {
      operation: 'create',
      paymentId: payment.id,
      adId: input.ad.id
    });

    if (payment.status === 'pending' && !isValidPaymentConfirmationUrl(confirmationUrl)) {
      throw new AppError('YooKassa did not return a valid payment confirmation URL', 502, {
        code: 'YOOKASSA_CONFIRMATION_URL_INVALID',
        paymentId: payment.id
      });
    }

    const dbPayment = await this.db.adPayment.create({
      data: {
        adId: input.ad.id,
        yooKassaPaymentId: payment.id,
        idempotenceKey,
        status: this.mapPaymentStatus(payment.status),
        amountValue: payment.amount.value,
        currency: payment.amount.currency,
        confirmationUrl,
        paidAt: payment.status === 'succeeded' && payment.paid ? new Date() : undefined,
        rawPayloadJson: JSON.stringify(payment),
        purposeCode: purposeClassification.primary,
        purposeComponentsJson: JSON.stringify(purposeClassification.components),
        packagePublications,
        includesMediaHighlight: input.mediaFeeRequired
      } as never
    });

    return {
      id: dbPayment.id,
      paymentId: dbPayment.yooKassaPaymentId,
      status: dbPayment.status.toLowerCase(),
      amount: dbPayment.amountValue,
      currency: dbPayment.currency,
      confirmationUrl: dbPayment.confirmationUrl,
      test: payment.test ?? this.settings.testMode
    };
  }

  async handleWebhook(payload: unknown): Promise<{ handled: boolean; event?: string; paymentId?: string }> {
    const notification = this.parseNotification(payload);

    if (!notification) {
      logger.info({ handled: false }, '[PAYMENT_WEBHOOK] ignored unsupported notification');
      return { handled: false };
    }

    if (notification.kind === 'refund') {
      await this.handleRefundSucceeded(notification.refund);
      logger.info(
        {
          event: notification.event,
          paymentId: notification.refund.payment_id,
          refundId: notification.refund.id
        },
        '[PAYMENT_WEBHOOK] handled refund'
      );
      return {
        handled: true,
        event: notification.event,
        paymentId: notification.refund.payment_id
      };
    }

    const handled = await this.syncPaymentByYooKassaPaymentId(notification.paymentId);

    if (!handled) {
      logger.warn({ paymentId: notification.paymentId, event: notification.event }, '[PAYMENT_WEBHOOK] payment is not linked to an ad');
      return {
        handled: false,
        event: notification.event,
        paymentId: notification.paymentId
      };
    }

    logger.info(
      {
        event: notification.event,
        paymentId: notification.paymentId
      },
      '[PAYMENT_WEBHOOK] handled payment'
    );

    return {
      handled: true,
      event: notification.event,
      paymentId: notification.paymentId
    };
  }

  async reconcilePendingOwnerPayments(ownerId: string): Promise<AdPaymentReconcileResult> {
    const result: AdPaymentReconcileResult = {
      checked: 0,
      succeeded: 0,
      canceled: 0,
      waiting: 0,
      failed: 0
    };

    if (!this.isPaymentRequired()) {
      return result;
    }

    const payments = await this.db.adPayment.findMany({
      where: {
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.WAITING_FOR_CAPTURE]
        },
        ad: {
          ownerId,
          status: AdStatus.PAYMENT_PENDING
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20,
      select: {
        yooKassaPaymentId: true
      }
    });

    for (const payment of payments) {
      result.checked += 1;

      try {
        const remotePayment = await this.syncPaymentByYooKassaPaymentId(payment.yooKassaPaymentId);

        if (!remotePayment) {
          result.failed += 1;
          continue;
        }

        if (remotePayment.status === 'succeeded' && remotePayment.paid) {
          result.succeeded += 1;
        } else if (remotePayment.status === 'canceled') {
          result.canceled += 1;
        } else {
          result.waiting += 1;
        }
      } catch (error) {
        result.failed += 1;
        logger.warn({ error, paymentId: payment.yooKassaPaymentId }, 'Failed to reconcile YooKassa payment');
      }
    }

    if (result.checked > 0) {
      logger.info({ ownerId, ...result }, 'Reconciled pending YooKassa payments');
    }

    return result;
  }

  async reconcileRecentPendingPayments(limit = 30): Promise<AdPaymentReconcileResult> {
    const result: AdPaymentReconcileResult = {
      checked: 0,
      succeeded: 0,
      canceled: 0,
      waiting: 0,
      failed: 0
    };

    if (!this.isPaymentRequired()) {
      return result;
    }

    const payments = await this.db.adPayment.findMany({
      where: {
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.WAITING_FOR_CAPTURE]
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      select: {
        yooKassaPaymentId: true
      }
    });

    for (const payment of payments) {
      result.checked += 1;

      try {
        const remotePayment = await this.syncPaymentByYooKassaPaymentId(payment.yooKassaPaymentId);

        if (!remotePayment) {
          result.failed += 1;
          continue;
        }

        if (remotePayment.status === 'succeeded' && remotePayment.paid) {
          result.succeeded += 1;
        } else if (remotePayment.status === 'canceled') {
          result.canceled += 1;
        } else {
          result.waiting += 1;
        }
      } catch (error) {
        result.failed += 1;
        logger.warn({ error, paymentId: payment.yooKassaPaymentId }, 'Failed to reconcile pending YooKassa payment');
      }
    }

    if (result.checked > 0) {
      logger.info(result, 'Reconciled recent pending YooKassa payments');
    }

    return result;
  }

  async syncPaymentByYooKassaPaymentId(paymentId: string): Promise<YooKassaPayment | null> {
    const localPayment = await this.db.adPayment.findUnique({
      where: {
        yooKassaPaymentId: paymentId
      },
      include: {
        ad: true
      }
    });

    if (!localPayment) {
      return null;
    }

    const remotePayment = await this.yooKassaClient.getPayment(paymentId);

    this.assertPaymentMatches(localPayment, remotePayment);
    await this.applyRemotePaymentStatus(localPayment.id, remotePayment);

    return remotePayment;
  }

  async refundLatestSucceededAdPayment(adId: string, reason?: string): Promise<AdPaymentRefundResult> {
    const ad = await this.db.ad.findUnique({
      where: {
        id: adId
      },
      select: {
        ownerId: true,
        title: true,
        type: true,
        metadataJson: true
      }
    });

    if (!ad || !this.isPaymentRequiredForAd(ad)) {
      return {
        status: 'skipped',
        reason: !ad ? 'ad_not_found' : 'payment_not_required'
      };
    }

    const payment = await this.db.adPayment.findFirst({
      where: {
        adId,
        status: PaymentStatus.SUCCEEDED,
        refundedAt: null,
        yooKassaRefundId: null
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!payment) {
      return {
        status: 'skipped',
        reason: 'no_succeeded_payment'
      };
    }

    const refundPolicy = getRejectedVacancyRefundPolicy(this.getVacancyBillingMetadata(ad.metadataJson));

    if (refundPolicy.action === 'skip_yookassa_refund') {
      logger.info(
        {
          adId,
          paymentId: payment.yooKassaPaymentId,
          policy: refundPolicy.reason
        },
        '[PAYMENT_REFUND] skipped YooKassa refund'
      );
      return {
        status: 'skipped',
        reason: refundPolicy.reason
      };
    }

    const refundAmountValue = refundPolicy.action === 'partial_refund' ? refundPolicy.amountValue : payment.amountValue;
    const refund = await this.yooKassaClient.createRefund(
      {
        payment_id: payment.yooKassaPaymentId,
        amount: {
          value: refundAmountValue,
          currency: payment.currency
        },
        description: this.formatRefundDescription(adId, reason)
      },
      randomUUID()
    );

    await this.db.adPayment.update({
      where: {
        id: payment.id
      },
      data: {
        status: refund.status === 'succeeded' ? PaymentStatus.REFUNDED : payment.status,
        yooKassaRefundId: refund.id,
        refundedAt: refund.status === 'succeeded' ? new Date() : undefined,
        refundPayloadJson: JSON.stringify(refund)
      }
    });

    logger.info(
      {
        adId,
        paymentId: payment.yooKassaPaymentId,
        refundId: refund.id,
        status: refund.status,
        amountValue: refundAmountValue,
        policy: refundPolicy.reason
      },
      '[PAYMENT_REFUND] requested'
    );

    if (refund.status === 'succeeded' && this.notificationService) {
      await this.notificationService.notify({
        userId: ad.ownerId,
        type: 'REFUND_COMPLETED',
        title: 'Возврат выполнен',
        body: `Возврат ${refundAmountValue} ${payment.currency} по объявлению «${ad.title}» завершён.`,
        category: 'payments',
        critical: true,
        idempotencyKey: `payment:${payment.id}:refund:${refund.id}:completed`,
        deepLink: this.notificationService.buildMyAdsLink(),
        payload: {
          adId,
          paymentId: payment.id,
          refundId: refund.id,
          amountValue: refundAmountValue
        }
      });
    }

    return {
      status: refund.status === 'succeeded' ? 'refunded' : 'pending',
      refundId: refund.id
    };
  }

  async refundSucceededAdPayment(paymentRecordId: string, reason?: string): Promise<AdPaymentRefundResult> {
    const payment = await this.db.adPayment.findFirst({
      where: {
        id: paymentRecordId,
        status: PaymentStatus.SUCCEEDED,
        refundedAt: null,
        yooKassaRefundId: null
      },
      include: {
        ad: {
          select: {
            id: true,
            ownerId: true,
            title: true,
            type: true
          }
        }
      }
    });

    if (!payment) {
      return {
        status: 'skipped',
        reason: 'no_succeeded_payment'
      };
    }

    if (!requiresAdPayment(payment.ad.type)) {
      return {
        status: 'skipped',
        reason: 'payment_not_required'
      };
    }

    const refundPolicy = getRejectedVacancyRefundPolicy({
      source: 'payment',
      publications: payment.packagePublications,
      mediaFeeRequired: payment.includesMediaHighlight
    });

    if (refundPolicy.action === 'skip_yookassa_refund') {
      return {
        status: 'skipped',
        reason: refundPolicy.reason
      };
    }

    const refundAmountValue = refundPolicy.action === 'partial_refund' ? refundPolicy.amountValue : payment.amountValue;
    const refund = await this.yooKassaClient.createRefund(
      {
        payment_id: payment.yooKassaPaymentId,
        amount: {
          value: refundAmountValue,
          currency: payment.currency
        },
        description: this.formatRefundDescription(payment.ad.id, reason)
      },
      randomUUID()
    );

    await this.db.adPayment.update({
      where: {
        id: payment.id
      },
      data: {
        status: refund.status === 'succeeded' ? PaymentStatus.REFUNDED : payment.status,
        yooKassaRefundId: refund.id,
        refundedAt: refund.status === 'succeeded' ? new Date() : undefined,
        refundPayloadJson: JSON.stringify(refund)
      }
    });

    if (refund.status === 'succeeded' && this.notificationService) {
      await this.notificationService.notify({
        userId: payment.ad.ownerId,
        type: 'REFUND_COMPLETED',
        title: 'Возврат выполнен',
        body: `Возврат ${refundAmountValue} ${payment.currency} по объявлению «${payment.ad.title}» завершён.`,
        category: 'payments',
        critical: true,
        idempotencyKey: `payment:${payment.id}:refund:${refund.id}:completed`,
        deepLink: this.notificationService.buildMyAdsLink(),
        payload: {
          adId: payment.ad.id,
          paymentId: payment.id,
          refundId: refund.id,
          amountValue: refundAmountValue
        }
      });
    }

    return {
      status: refund.status === 'succeeded' ? 'refunded' : 'pending',
      refundId: refund.id
    };
  }

  private async markPaymentSucceeded(paymentRecordId: string, payment: YooKassaPayment): Promise<void> {
    const notificationContext = await this.db.$transaction(async (tx): Promise<PaymentSucceededNotificationContext | null> => {
      const current = await tx.adPayment.findUnique({
        where: {
          id: paymentRecordId
        },
        include: {
          ad: true
        }
      });

      if (!current) {
        return null;
      }

      const wasAlreadySucceeded = current.status === PaymentStatus.SUCCEEDED;
      const wasAlreadyApplied = current.appliedAt !== null;
      const billing = this.getVacancyBillingMetadata(current.ad.metadataJson);
      const packagePublications = current.packagePublications || this.getBillingPackagePublications(billing);
      const includesMediaFee = current.includesMediaHighlight || billing?.mediaFeeRequired === true || billing?.mediaHighlight === true;
      const paymentPurpose = this.getStoredPaymentPurpose(current as unknown as { purposeCode?: string | null; purposeComponentsJson?: string | null }, {
        packagePublications,
        includesMediaFee
      });
      const paymentEffects = getPaymentPurposeEffects(paymentPurpose);

      if (paymentEffects.activatesPromotion || paymentEffects.unlocksResumeContact) {
        this.assertRemotePaymentMatchesStored(payment, current.amountValue, current.currency);
      }

      if (wasAlreadyApplied) {
        await tx.adPayment.update({
          where: {
            id: current.id
          },
          data: {
            status: PaymentStatus.SUCCEEDED,
            paidAt: current.paidAt ?? new Date(),
            rawPayloadJson: JSON.stringify(payment)
          }
        });
        return null;
      }

      const appliedAt = new Date();
      const claimed = await tx.adPayment.updateMany({
        where: {
          id: current.id,
          appliedAt: null
        },
        data: {
          status: PaymentStatus.SUCCEEDED,
          paidAt: current.paidAt ?? appliedAt,
          appliedAt,
          rawPayloadJson: JSON.stringify(payment)
        }
      });

      if (claimed.count !== 1) {
        return null;
      }

      let resumeUnlock: PaymentSucceededNotificationContext['resumeUnlock'] = null;
      let referralReward: PaymentSucceededNotificationContext['referralReward'] = null;
      let promotionActivated: PaymentSucceededNotificationContext['promotionActivated'] = null;
      let adForModeration: Ad | null = null;

      if (paymentEffects.unlocksResumeContact) {
        const unlock = await tx.resumeContactUnlock.findFirst({
          where: {
            paymentId: current.id
          },
          select: {
            id: true,
            buyerUserId: true,
            resumeAdId: true,
            verifiedContactId: true,
            consentId: true,
            accessMode: true,
            resumeAd: {
              select: {
                title: true,
                type: true,
                status: true,
                deletedAt: true,
                ownerId: true,
                owner: {
                  select: {
                    status: true,
                    deletedAt: true
                  }
                }
              }
            }
          }
        });

        if (!unlock) {
          throw new AppError('Resume contact unlock record not found for payment', 409, {
            code: 'RESUME_CONTACT_UNLOCK_NOT_FOUND',
            paymentId: payment.id
          });
        }

        if (!unlock.verifiedContactId || !unlock.consentId || unlock.accessMode !== ContactAccessMode.MAX_VERIFIED_CONNECTION) {
          throw new AppError('Resume connection payment has no verified contact snapshot', 409, {
            code: 'RESUME_CONNECTION_CONTACT_SNAPSHOT_MISSING',
            paymentId: payment.id
          });
        }

        if (
          unlock.resumeAd.type !== AdType.RESUME ||
          (unlock.resumeAd.status !== AdStatus.APPROVED && unlock.resumeAd.status !== AdStatus.PUBLISHED) ||
          unlock.resumeAd.deletedAt ||
          unlock.resumeAd.owner.status !== UserStatus.ACTIVE ||
          unlock.resumeAd.owner.deletedAt
        ) {
          throw new AppError('Resume contact unlock payment is linked to an unavailable resume', 409, {
            code: 'RESUME_CONTACT_UNLOCK_RESUME_UNAVAILABLE',
            paymentId: payment.id,
            resumeAdId: unlock.resumeAdId
          });
        }

        const [verifiedContact, consent] = await Promise.all([
          tx.verifiedContact.findUnique({
            where: {
              id: unlock.verifiedContactId
            }
          }),
          tx.contactDisclosureConsent.findUnique({
            where: {
              id: unlock.consentId
            }
          })
        ]);

        const now = new Date();
        if (
          !verifiedContact ||
          verifiedContact.userId !== unlock.resumeAd.ownerId ||
          verifiedContact.status !== ContactStatus.VERIFIED ||
          verifiedContact.revokedAt ||
          (verifiedContact.expiresAt && verifiedContact.expiresAt <= now) ||
          !consent ||
          consent.userId !== unlock.resumeAd.ownerId ||
          consent.verifiedContactId !== verifiedContact.id ||
          consent.revokedAt
        ) {
          throw new AppError('Verified resume contact is no longer available', 409, {
            code: 'RESUME_CONNECTION_CONTACT_UNAVAILABLE',
            paymentId: payment.id,
            resumeAdId: unlock.resumeAdId
          });
        }

        await tx.resumeContactUnlock.updateMany({
          where: {
            paymentId: current.id,
            status: {
              not: PaymentStatus.SUCCEEDED
            }
          },
          data: {
            status: PaymentStatus.SUCCEEDED,
            unlockedAt: new Date()
          }
        });

        await tx.contactAccessEntitlement.upsert({
          where: {
            paymentId: current.id
          },
          update: {
            status: ContactAccessStatus.ACTIVE,
            grantedAt: now
          },
          create: {
            buyerUserId: unlock.buyerUserId,
            resumeAdId: unlock.resumeAdId,
            authorUserId: unlock.resumeAd.ownerId,
            verifiedContactId: verifiedContact.id,
            consentId: consent.id,
            paymentId: current.id,
            legacyUnlockId: unlock.id,
            accessMode: ContactAccessMode.MAX_VERIFIED_CONNECTION,
            status: ContactAccessStatus.ACTIVE,
            grantedAt: now
          }
        });

        resumeUnlock = unlock
          ? {
              id: unlock.id,
              buyerUserId: unlock.buyerUserId,
              resumeAdId: unlock.resumeAdId,
              resumeTitle: unlock.resumeAd.title
            }
          : null;
      }

      if (paymentEffects.activatesPromotion) {
        const isPromotableAd =
          (current.ad.status === AdStatus.APPROVED || current.ad.status === AdStatus.PUBLISHED) &&
          !current.ad.deletedAt &&
          !current.ad.hiddenAt &&
          !current.ad.archivedAt;

        if (!isPromotableAd) {
          throw new AppError('Promotion payment is linked to an unavailable ad', 409, {
            code: 'PROMOTION_AD_UNAVAILABLE',
            paymentRecordId: current.id,
            adId: current.adId,
            status: current.ad.status
          });
        }

        const promotion = await tx.promotionPurchase.findFirst({
          where: {
            paymentId: current.id
          },
          include: {
            product: {
              select: {
                durationHours: true
              }
            }
          }
        });

        if (!promotion) {
          throw new AppError('Promotion purchase not found for payment', 404, {
            code: 'PROMOTION_PURCHASE_NOT_FOUND',
            paymentRecordId: current.id
          });
        }

        const now = new Date();
        const endsAt = promotion.productType === PromotionProductType.BUMP_ONCE
          ? null
          : new Date(now.getTime() + (promotion.product.durationHours ?? 24) * 60 * 60 * 1000);

        await tx.promotionPurchase.updateMany({
          where: {
            id: promotion.id,
            status: {
              not: PaymentStatus.SUCCEEDED
            }
          },
          data: {
            status: PaymentStatus.SUCCEEDED,
            startsAt: promotion.startsAt ?? now,
            endsAt,
            lastBumpedAt:
              promotion.productType === PromotionProductType.BUMP_ONCE || promotion.productType === PromotionProductType.AUTO_BUMP
                ? now
                : promotion.lastBumpedAt
          }
        });

        await tx.ad.update({
          where: {
            id: current.adId
          },
          data: this.getPromotionAdUpdate(promotion.productType, endsAt, now)
        });

        promotionActivated = {
          id: promotion.id,
          productType: promotion.productType,
          endsAt
        };
      }

      if (paymentEffects.addsVacancyPublications && packagePublications > 0) {
        await this.addVacancyPublications(tx, current.ad.ownerId, packagePublications, 0);
      }

      if (paymentEffects.consumesVacancyPublication) {
        await this.consumeVacancyPublicationCredit(tx, current.ad.ownerId, current.adId, packagePublications > 0);
      }

      if (!wasAlreadySucceeded && paymentEffects.addsVacancyPublications && packagePublications > 0) {
        referralReward = await this.rewardReferralIfFirstSucceededPayment(tx, current.ad.ownerId);
      }

      if (paymentEffects.submitsVacancyToModeration && this.adRevisionRepository) {
        await this.adRevisionRepository.markSubmittedByPaymentId(current.id);
      }

      if (paymentEffects.submitsVacancyToModeration && current.ad.status === AdStatus.PAYMENT_PENDING) {
        adForModeration = await tx.ad.update({
          where: {
            id: current.adId
          },
          data: {
            status: AdStatus.PENDING_MODERATION,
            hiddenAt: null,
            archivedAt: null,
            deletedAt: null
          }
        });

        await tx.moderationLog.create({
          data: {
            adId: current.adId,
            action: ModerationAction.SUBMITTED,
            statusFrom: current.ad.status,
            statusTo: AdStatus.PENDING_MODERATION,
            metadataJson: JSON.stringify({
              paymentId: payment.id
            })
          }
        });
      }

      return {
        adForModeration,
        ownerId: current.ad.ownerId,
        adId: current.adId,
        adType: current.ad.type,
        adTitle: current.ad.title,
        paymentRecordId: current.id,
        amountValue: current.amountValue,
        packagePublications,
        paymentEffects,
        resumeUnlock,
        referralReward,
        promotionActivated
      };
    });

    logger.info(
      {
        paymentRecordId,
        paymentId: payment.id,
        notifiedModeration: Boolean(notificationContext?.adForModeration)
      },
      '[PAYMENT_SUCCEEDED] succeeded payment applied'
    );

    if (notificationContext?.adForModeration) {
      void this.moderationNotificationService.notifyNewAd(notificationContext.adForModeration, notificationContext.adForModeration.ownerId);
    }

    await this.notifyPaymentSucceeded(notificationContext);
    await this.recordSucceededPaymentAnalytics(notificationContext);
  }

  private async recordSucceededPaymentAnalytics(context: PaymentSucceededNotificationContext | null): Promise<void> {
    if (!context || !this.adAnalyticsService) {
      return;
    }

    const tasks: Array<Promise<void>> = [];

    if (context.resumeUnlock) {
      tasks.push(this.adAnalyticsService.recordSystemEvent(context.resumeUnlock.resumeAdId, 'resume_contact_unlock_purchased'));
    }

    if (context.promotionActivated) {
      tasks.push(this.adAnalyticsService.recordSystemEvent(context.adId, 'promotion_purchased'));
    }

    if (tasks.length === 0) {
      return;
    }

    try {
      await Promise.all(tasks);
    } catch (error) {
      logger.warn(
        {
          err: error,
          paymentRecordId: context.paymentRecordId
        },
        '[AD_ANALYTICS] failed to record succeeded payment metrics'
      );
    }
  }

  private async markPaymentCanceled(paymentRecordId: string, payment: YooKassaPayment): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.adPayment.update({
        where: {
          id: paymentRecordId
        },
        data: {
          status: PaymentStatus.CANCELED,
          canceledAt: new Date(),
          rawPayloadJson: JSON.stringify(payment)
        }
      });

      await tx.resumeContactUnlock.updateMany({
        where: {
          paymentId: paymentRecordId,
          status: {
            not: PaymentStatus.SUCCEEDED
          }
        },
        data: {
          status: PaymentStatus.CANCELED
        }
      });

      await tx.promotionPurchase.updateMany({
        where: {
          paymentId: paymentRecordId,
          status: {
            not: PaymentStatus.SUCCEEDED
          }
        },
        data: {
          status: PaymentStatus.CANCELED
        }
      });
    });

    logger.info(
      {
        paymentRecordId,
        paymentId: payment.id,
        status: payment.status
      },
      '[PAYMENT_FAILED] payment canceled'
    );
  }

  private async markPaymentWaiting(paymentRecordId: string, payment: YooKassaPayment): Promise<void> {
    await this.db.adPayment.update({
      where: {
        id: paymentRecordId
      },
      data: {
        status: this.mapPaymentStatus(payment.status),
        rawPayloadJson: JSON.stringify(payment)
      }
    });
  }

  private async applyRemotePaymentStatus(paymentRecordId: string, payment: YooKassaPayment): Promise<void> {
    if (payment.status === 'succeeded' && payment.paid) {
      await this.markPaymentSucceeded(paymentRecordId, payment);
      return;
    }

    if (payment.status === 'canceled') {
      await this.markPaymentCanceled(paymentRecordId, payment);
      return;
    }

    await this.markPaymentWaiting(paymentRecordId, payment);
  }

  private async handleRefundSucceeded(refund: YooKassaRefund): Promise<void> {
    const payment = await this.db.adPayment.findUnique({
      where: {
        yooKassaPaymentId: refund.payment_id
      },
      include: {
        ad: {
          select: {
            ownerId: true,
            title: true
          }
        }
      }
    });

    if (!payment) {
      logger.warn({ refundId: refund.id, paymentId: refund.payment_id }, 'YooKassa refund is not linked to an ad payment');
      return;
    }

    if (payment.currency !== refund.amount.currency || Number(refund.amount.value) <= 0 || Number(refund.amount.value) > Number(payment.amountValue)) {
      throw new AppError('YooKassa refund amount does not match local payment', 400, {
        refundId: refund.id,
        paymentId: refund.payment_id,
        expectedMax: {
          value: payment.amountValue,
          currency: payment.currency
        },
        actual: refund.amount
      });
    }

    await this.db.adPayment.update({
      where: {
        id: payment.id
      },
      data: {
        status: PaymentStatus.REFUNDED,
        yooKassaRefundId: refund.id,
        refundedAt: new Date(),
        refundPayloadJson: JSON.stringify(refund)
      }
    });

    if (this.notificationService) {
      await this.notificationService.notify({
        userId: payment.ad.ownerId,
        type: 'REFUND_COMPLETED',
        title: 'Возврат выполнен',
        body: `Возврат ${refund.amount.value} ${refund.amount.currency} по объявлению «${payment.ad.title}» завершён.`,
        category: 'payments',
        critical: true,
        idempotencyKey: `payment:${payment.id}:refund:${refund.id}:completed`,
        deepLink: this.notificationService.buildMyAdsLink(),
        payload: {
          adId: payment.adId,
          paymentId: payment.id,
          refundId: refund.id,
          amountValue: refund.amount.value
        }
      });
    }
  }

  private assertPaymentMatches(
    localPayment: {
      adId: string;
      amountValue: string;
      currency: string;
    },
    remotePayment: YooKassaPayment
  ): void {
    if (remotePayment.metadata?.purpose !== AD_PAYMENT_PURPOSE || remotePayment.metadata.adId !== localPayment.adId) {
      throw new AppError('YooKassa payment metadata does not match local ad payment', 400, {
        paymentId: remotePayment.id,
        adId: localPayment.adId
      });
    }

    if (remotePayment.amount.value !== localPayment.amountValue || remotePayment.amount.currency !== localPayment.currency) {
      throw new AppError('YooKassa payment amount does not match local ad payment', 400, {
        paymentId: remotePayment.id,
        expected: {
          value: localPayment.amountValue,
          currency: localPayment.currency
        },
        actual: remotePayment.amount
      });
    }

    this.assertYooKassaEnvironmentMatches(remotePayment, {
      operation: 'sync',
      paymentId: remotePayment.id,
      adId: localPayment.adId
    });
  }

  private assertYooKassaEnvironmentMatches(
    payment: YooKassaPayment,
    context: {
      operation: 'create' | 'sync';
      paymentId: string;
      adId: string;
    }
  ): void {
    if (this.settings.testMode) {
      if (payment.test !== true) {
        throw new AppError('YooKassa payment is not marked as test payment', 400, {
          code: 'YOOKASSA_LIVE_PAYMENT_IN_TEST_MODE',
          ...context
        });
      }

      return;
    }

    if (payment.test === true) {
      logger.error(context, '[PAYMENT_FAILED] YooKassa returned a test payment while production payments are required');
      throw new AppError('YooKassa returned a test payment while production payments are required', 502, {
        code: 'YOOKASSA_TEST_PAYMENT_IN_PRODUCTION',
        ...context
      });
    }
  }

  private parseNotification(payload: unknown): YooKassaNotification | null {
    if (!isRecord(payload)) {
      throw new AppError('Invalid YooKassa notification body', 400);
    }

    const event = payload.event;
    const object = payload.object;

    if (typeof event !== 'string' || !isRecord(object)) {
      throw new AppError('Invalid YooKassa notification body', 400);
    }

    if (event === 'payment.waiting_for_capture' || event === 'payment.succeeded' || event === 'payment.canceled') {
      if (typeof object.id !== 'string') {
        throw new AppError('Invalid YooKassa payment notification object', 400);
      }

      return {
        kind: 'payment',
        event,
        paymentId: object.id
      };
    }

    if (event === 'refund.succeeded') {
      if (
        typeof object.id !== 'string' ||
        typeof object.payment_id !== 'string' ||
        !isRecord(object.amount) ||
        typeof object.amount.value !== 'string' ||
        typeof object.amount.currency !== 'string'
      ) {
        throw new AppError('Invalid YooKassa refund notification object', 400);
      }

      return {
        kind: 'refund',
        event,
        refund: object as unknown as YooKassaRefund
      };
    }

    return null;
  }

  private mapPaymentStatus(status: YooKassaPayment['status']): PaymentStatus {
    if (status === 'waiting_for_capture') {
      return PaymentStatus.WAITING_FOR_CAPTURE;
    }

    if (status === 'succeeded') {
      return PaymentStatus.SUCCEEDED;
    }

    if (status === 'canceled') {
      return PaymentStatus.CANCELED;
    }

    return PaymentStatus.PENDING;
  }

  private formatRefundDescription(adId: string, reason?: string): string {
    const suffix = reason ? `: ${reason}` : '';
    return `Rejected ad ${adId}${suffix}`.slice(0, 128);
  }

  private getLatestPublicationDate(...dates: Array<Date | null | undefined>): Date | null {
    const timestamps = dates
      .filter((date): date is Date => date instanceof Date)
      .map((date) => date.getTime());

    if (timestamps.length === 0) {
      return null;
    }

    return new Date(Math.max(...timestamps));
  }

  async getVacancyPublicationBalance(ownerId: string): Promise<VacancyPublicationBalance> {
    const balance = await this.ensureVacancyPublicationBalance(ownerId);

    return {
      purchased: balance.purchased,
      bonus: balance.bonus,
      used: balance.used,
      remaining: balance.remaining
    };
  }

  async prepareVacancyRepublish(adId: string, ownerId: string, request: VacancyRepublishRequest = {}): Promise<{
    ad: Ad;
    payment: AdPaymentPayload | null;
  }> {
    const balance = await this.getVacancyPublicationBalance(ownerId);
    const plan = getVacancyPublicationPlan(request.publicationPlan);
    const fundingMode = request.publicationFunding ?? 'auto';
    const usesPackageCredit = fundingMode !== 'buy_package' && balance.remaining > 0;
    const mediaFeeRequired = await this.hasPaidMediaForAd(adId);
    const requiresPayment = !usesPackageCredit || mediaFeeRequired;
    const paymentAmountValue = getVacancyPublicationPaymentAmount({
      planCode: plan.code,
      usesBalance: usesPackageCredit,
      mediaFeeRequired
    });

    if (fundingMode === 'use_balance' && !usesPackageCredit) {
      throw new AppError('No vacancy publication credits available', 402, {
        code: 'VACANCY_PUBLICATION_BALANCE_EMPTY',
        ownerId,
        adId
      });
    }

    const updatedAd = await this.db.$transaction(async (tx) => {
      const current = await tx.ad.findFirst({
        where: {
          id: adId,
          ownerId,
          type: AdType.VACANCY,
          deletedAt: null
        }
      });

      if (!current) {
        throw new AppError('Vacancy not found for repeat publication', 404, {
          adId,
          ownerId
        });
      }

      if (current.status === AdStatus.PAYMENT_PENDING || current.status === AdStatus.PENDING_MODERATION) {
        throw new AppError('Vacancy already has an active publication operation', 409, {
          code: 'VACANCY_PUBLICATION_ALREADY_IN_PROGRESS',
          adId,
          status: current.status.toLowerCase()
        });
      }

      const metadata = this.mergeVacancyBillingMetadata(current.metadataJson, {
        purpose: VACANCY_PUBLICATION_PURPOSE,
        source: requiresPayment ? 'payment' : 'credit',
        planCode: plan.code,
        publications: usesPackageCredit ? 0 : plan.publications,
        mediaHighlight: mediaFeeRequired,
        mediaFeeRequired,
        highlightAmountValue: mediaFeeRequired ? VACANCY_MEDIA_FEE_AMOUNT_RUB : undefined,
        paymentAmountValue: requiresPayment ? paymentAmountValue : undefined
      });

      if (!requiresPayment) {
        await this.consumeVacancyPublicationCredit(tx, ownerId, adId, false);
      }

      const nextStatus = requiresPayment ? AdStatus.PAYMENT_PENDING : AdStatus.PENDING_MODERATION;
      const updated = await tx.ad.update({
        where: {
          id: adId
        },
        data: {
          status: nextStatus,
          metadataJson: metadata,
          hiddenAt: null,
          archivedAt: null,
          deletedAt: null
        }
      });

      await tx.moderationLog.create({
        data: {
          adId,
          action: ModerationAction.SUBMITTED,
          statusFrom: current.status,
          statusTo: nextStatus,
          metadataJson: JSON.stringify({
            funding: requiresPayment ? 'payment' : 'credit',
            republish: true,
            mediaFeeRequired
          })
        }
      });

      return updated;
    });

    const payment = requiresPayment ? await this.createPaymentForAd(updatedAd) : null;

    return { ad: updatedAd, payment };
  }

  async submitVacancyUsingCredit(adId: string, ownerId: string): Promise<Ad> {
    await this.ensureVacancyPublicationBalance(ownerId);

    return this.db.$transaction(async (tx) => {
      const ad = await tx.ad.findFirst({
        where: {
          id: adId,
          ownerId,
          type: AdType.VACANCY,
          status: AdStatus.DRAFT,
          deletedAt: null
        }
      });

      if (!ad) {
        throw new AppError('Draft vacancy not found for credit publication', 404, {
          adId,
          ownerId
        });
      }

      await this.consumeVacancyPublicationCredit(tx, ownerId, adId, false);

      const updatedAd = await tx.ad.update({
        where: {
          id: adId
        },
        data: {
          status: AdStatus.PENDING_MODERATION,
          hiddenAt: null,
          archivedAt: null,
          deletedAt: null
        }
      });

      await tx.moderationLog.create({
        data: {
          adId,
          action: ModerationAction.SUBMITTED,
          statusFrom: AdStatus.DRAFT,
          statusTo: AdStatus.PENDING_MODERATION,
          metadataJson: JSON.stringify({
            funding: 'credit'
          })
        }
      });

      return updatedAd;
    });
  }

  async consumeVacancyPublicationCreditForRevision(adId: string, ownerId: string): Promise<void> {
    await this.ensureVacancyPublicationBalance(ownerId);

    await this.db.$transaction(async (tx) => {
      const ad = await tx.ad.findFirst({
        where: {
          id: adId,
          ownerId,
          type: AdType.VACANCY,
          deletedAt: null
        },
        select: {
          metadataJson: true
        }
      });

      if (!ad) {
        throw new AppError('Vacancy not found for revision publication credit', 404, {
          adId,
          ownerId
        });
      }

      await this.consumeVacancyPublicationCredit(tx, ownerId, adId, false);

      await tx.ad.update({
        where: {
          id: adId
        },
        data: {
          metadataJson: this.mergeVacancyBillingMetadata(ad.metadataJson, {
            purpose: VACANCY_PUBLICATION_PURPOSE,
            source: 'credit',
            planCode: 'single',
            publications: 0,
            mediaHighlight: false,
            mediaFeeRequired: false,
            paymentAmountValue: undefined
          })
        }
      });
    });
  }

  async returnVacancyPublicationCredit(adId: string): Promise<{ returned: boolean; reason?: string }> {
    return this.db.$transaction(async (tx) => {
      const usage = await tx.vacancyPublicationUsage.findFirst({
        where: {
          adId,
          returnedAt: null
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          id: true,
          userId: true,
          returnedAt: true
        }
      });

      if (!usage) {
        return {
          returned: false,
          reason: 'usage_not_found'
        };
      }

      await tx.vacancyPublicationUsage.update({
        where: {
          id: usage.id
        },
        data: {
          returnedAt: new Date()
        }
      });

      await tx.userVacancyPublicationBalance.update({
        where: {
          userId: usage.userId
        },
        data: {
          used: {
            decrement: 1
          },
          remaining: {
            increment: 1
          }
        }
      });

      return {
        returned: true
      };
    });
  }

  async getLegacyVacancyPublicationBalance(ownerId: string): Promise<VacancyPublicationBalance> {
    const [paidVacancyAds, bonusGrants, usedVacancyAds] = await this.db.$transaction([
      this.db.ad.findMany({
        where: {
          ownerId,
          type: AdType.VACANCY,
          deletedAt: null,
          payments: {
            some: {
              status: PaymentStatus.SUCCEEDED,
              refundedAt: null
            }
          }
        },
        select: {
          metadataJson: true
        }
      }),
      this.db.vacancyPublicationGrant.findMany({
        where: {
          userId: ownerId
        },
        select: {
          publications: true
        }
      }),
      this.db.ad.findMany({
        where: {
          ownerId,
          type: AdType.VACANCY,
          deletedAt: null,
          status: {
            in: [AdStatus.PENDING_MODERATION, AdStatus.APPROVED, AdStatus.PUBLISHED, AdStatus.HIDDEN, AdStatus.ARCHIVED]
          }
        },
        select: {
          id: true
        }
      })
    ]);

    const paidPurchased = paidVacancyAds.reduce((sum, ad) => {
      const billing = this.getVacancyBillingMetadata(ad.metadataJson);
      const plan = getVacancyPublicationPlan(billing?.planCode);

      return sum + (billing?.publications ?? plan.publications);
    }, 0);
    const bonus = bonusGrants.reduce((sum, grant) => sum + grant.publications, 0);
    const purchased = paidPurchased;
    const used = usedVacancyAds.length;

    return {
      purchased,
      bonus,
      used,
      remaining: Math.max(0, purchased + bonus - used)
    };
  }

  private async ensureVacancyPublicationBalance(ownerId: string): Promise<BalanceRecord> {
    const existing = await this.db.userVacancyPublicationBalance.findUnique({
      where: {
        userId: ownerId
      }
    });

    if (existing) {
      return this.normalizeVacancyPublicationBalance(existing);
    }

    const legacy = await this.getLegacyVacancyPublicationBalance(ownerId);

    try {
      return await this.db.userVacancyPublicationBalance.create({
        data: {
          userId: ownerId,
          purchased: legacy.purchased,
          bonus: legacy.bonus,
          used: legacy.used,
          remaining: legacy.remaining
        }
      });
    } catch {
      const raced = await this.db.userVacancyPublicationBalance.findUnique({
        where: {
          userId: ownerId
        }
      });

      if (!raced) {
        throw new AppError('Unable to initialize vacancy publication balance', 500, {
          ownerId
        });
      }

      return raced;
    }
  }

  private async normalizeVacancyPublicationBalance(balance: BalanceRecord): Promise<BalanceRecord> {
    const expectedRemaining = Math.max(0, balance.purchased + balance.bonus - balance.used);

    if (balance.remaining === expectedRemaining) {
      return balance;
    }

    return this.db.userVacancyPublicationBalance.update({
      where: {
        userId: balance.userId
      },
      data: {
        remaining: expectedRemaining
      }
    });
  }

  private async addVacancyPublications(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    purchased: number,
    bonus: number
  ): Promise<void> {
    await transaction.userVacancyPublicationBalance.upsert({
      where: {
        userId: ownerId
      },
      update: {
        purchased: {
          increment: purchased
        },
        bonus: {
          increment: bonus
        },
        remaining: {
          increment: purchased + bonus
        }
      },
      create: {
        userId: ownerId,
        purchased,
        bonus,
        used: 0,
        remaining: purchased + bonus
      }
    });
  }

  private async consumeVacancyPublicationCredit(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    adId: string,
    preferPackageSource: boolean
  ): Promise<void> {
    const updatedBalance = await transaction.userVacancyPublicationBalance.updateMany({
      where: {
        userId: ownerId,
        remaining: {
          gt: 0
        }
      },
      data: {
        used: {
          increment: 1
        },
        remaining: {
          decrement: 1
        }
      }
    });

    if (updatedBalance.count !== 1) {
      throw new AppError('No vacancy publication credits available', 402, {
        code: 'VACANCY_PUBLICATION_BALANCE_EMPTY',
        ownerId,
        adId
      });
    }

    const source = preferPackageSource ? VacancyPublicationUsageSource.PACKAGE : VacancyPublicationUsageSource.MIXED;

    await transaction.vacancyPublicationUsage.create({
      data: {
        userId: ownerId,
        adId,
        source
      }
    });
  }

  private async backfillPaidVacancyUsage(ownerId: string, adId: string): Promise<void> {
    await this.ensureVacancyPublicationBalance(ownerId);

    const activeUsage = await this.db.vacancyPublicationUsage.findFirst({
      where: {
        adId,
        returnedAt: null
      },
      select: {
        id: true
      }
    });

    if (activeUsage) {
      return;
    }

    try {
      await this.db.vacancyPublicationUsage.create({
        data: {
          userId: ownerId,
          adId,
          source: VacancyPublicationUsageSource.PACKAGE
        }
      });
    } catch {
      const existingUsage = await this.db.vacancyPublicationUsage.findFirst({
        where: {
          adId,
          returnedAt: null
        },
        select: {
          returnedAt: true
        }
      });

      if (!existingUsage || existingUsage.returnedAt) {
        throw new AppError('Unable to backfill paid vacancy publication usage', 500, {
          ownerId,
          adId
        });
      }
    }
  }

  private async rewardReferralIfFirstSucceededPayment(
    transaction: Prisma.TransactionClient,
    referredUserId: string
  ): Promise<PaymentSucceededNotificationContext['referralReward']> {
    const succeededPayments = await transaction.adPayment.count({
      where: {
        status: PaymentStatus.SUCCEEDED,
        refundedAt: null,
        packagePublications: {
          gt: 0
        },
        ad: {
          ownerId: referredUserId
        }
      }
    });

    if (succeededPayments !== 1) {
      return null;
    }

    const referral = await transaction.referral.findUnique({
      where: {
        referredId: referredUserId
      },
      select: {
        id: true,
        referrerId: true,
        rewardedAt: true
      }
    });

    if (!referral || referral.rewardedAt) {
      return null;
    }

    await transaction.vacancyPublicationGrant.upsert({
      where: {
        sourceReferralId: referral.id
      },
      update: {},
      create: {
        userId: referral.referrerId,
        source: VacancyPublicationGrantSource.REFERRAL,
        sourceReferralId: referral.id,
        publications: 1
      }
    });

    await this.addVacancyPublications(transaction, referral.referrerId, 0, 1);

    await transaction.referral.update({
      where: {
        id: referral.id
      },
      data: {
        rewardedAt: new Date()
      }
    });

    logger.info(
      {
        referredUserId,
        referrerId: referral.referrerId,
        referralId: referral.id
      },
      '[REFERRAL] bonus publication credited'
    );

    return {
      referralId: referral.id,
      referrerId: referral.referrerId
    };
  }

  private async notifyPaymentSucceeded(context: PaymentSucceededNotificationContext | null): Promise<void> {
    if (!context || !this.notificationService) {
      return;
    }

    const tasks: Array<Promise<unknown>> = [
      this.notificationService.notify({
        userId: context.ownerId,
        type: 'PAYMENT_CONFIRMED',
        title: 'Платёж подтверждён',
        body: `Оплата ${context.amountValue} RUB успешно подтверждена.`,
        category: 'payments',
        critical: true,
        idempotencyKey: `payment:${context.paymentRecordId}:confirmed`,
        deepLink: this.notificationService.buildPaymentLink(context.paymentRecordId),
        payload: {
          paymentId: context.paymentRecordId,
          adId: context.adId,
          amountValue: context.amountValue
        }
      })
    ];

    if (context.paymentEffects.addsVacancyPublications && context.packagePublications > 0) {
      tasks.push(
        this.notificationService.notify({
          userId: context.ownerId,
          type: 'PUBLICATIONS_GRANTED',
          title: 'Начислены публикации',
          body: `На баланс добавлено публикаций: ${context.packagePublications}.`,
          category: 'payments',
          critical: true,
          idempotencyKey: `payment:${context.paymentRecordId}:publications`,
          deepLink: this.notificationService.buildProfileLink(),
          payload: {
            paymentId: context.paymentRecordId,
            publications: context.packagePublications
          }
        })
      );
    }

    if (context.resumeUnlock) {
      tasks.push(
        this.notificationService.notify({
          userId: context.resumeUnlock.buyerUserId,
          type: 'RESUME_CONTACT_UNLOCKED',
          title: 'Контакт резюме открыт',
          body: `Теперь доступен контакт резюме: ${context.resumeUnlock.resumeTitle}.`,
          category: 'payments',
          critical: true,
          idempotencyKey: `resume-contact-unlock:${context.resumeUnlock.id}:succeeded`,
          deepLink: this.notificationService.buildAdLink(context.resumeUnlock.resumeAdId, AdType.RESUME),
          payload: {
            unlockId: context.resumeUnlock.id,
            resumeAdId: context.resumeUnlock.resumeAdId,
            paymentId: context.paymentRecordId
          }
        })
      );
    }

    if (context.adForModeration) {
      tasks.push(
        this.notificationService.notify({
          userId: context.ownerId,
          type: 'AD_SUBMITTED_MODERATION',
          title: 'Объявление отправлено на модерацию',
          body: `После оплаты объявление «${context.adTitle}» отправлено на проверку.`,
          category: 'ad_status',
          idempotencyKey: `ad:${context.adId}:payment:${context.paymentRecordId}:submitted`,
          deepLink: this.notificationService.buildMyAdsLink(),
          payload: {
            adId: context.adId,
            paymentId: context.paymentRecordId
          }
        })
      );
    }

    if (context.promotionActivated) {
      tasks.push(
        this.notificationService.notify({
          userId: context.ownerId,
          type: 'PROMOTION_ACTIVATED',
          title: 'Продвижение включено',
          body: `Услуга «${this.getPromotionProductTitle(context.promotionActivated.productType)}» активирована для объявления «${context.adTitle}».`,
          category: 'payments',
          critical: true,
          idempotencyKey: `promotion:${context.promotionActivated.id}:activated`,
          deepLink: this.notificationService.buildAdLink(context.adId, context.adType),
          payload: {
            promotionPurchaseId: context.promotionActivated.id,
            adId: context.adId,
            productType: context.promotionActivated.productType,
            endsAt: context.promotionActivated.endsAt?.toISOString() ?? null,
            paymentId: context.paymentRecordId
          }
        })
      );
    }

    if (context.referralReward) {
      tasks.push(
        this.notificationService.notify({
          userId: context.referralReward.referrerId,
          type: 'REFERRAL_BONUS_RECEIVED',
          title: 'Получен реферальный бонус',
          body: 'На баланс добавлена 1 бонусная публикация.',
          category: 'payments',
          critical: true,
          idempotencyKey: `referral:${context.referralReward.referralId}:bonus`,
          deepLink: this.notificationService.buildProfileLink(),
          payload: {
            referralId: context.referralReward.referralId,
            publications: 1
          }
        })
      );
    }

    try {
      await Promise.all(tasks);
    } catch (error) {
      logger.warn(
        {
          err: error,
          paymentRecordId: context.paymentRecordId
        },
        '[NOTIFICATION] failed to enqueue payment notifications'
      );
    }
  }

  private assertRemotePaymentMatchesStored(payment: YooKassaPayment, amountValue: string, currency: string): void {
    if (payment.amount.value !== amountValue || payment.amount.currency !== currency) {
      throw new AppError('Payment amount does not match stored promotion price', 409, {
        code: 'PAYMENT_AMOUNT_MISMATCH',
        paymentId: payment.id,
        expectedAmount: amountValue,
        expectedCurrency: currency
      });
    }
  }

  private getPromotionAdUpdate(type: PromotionProductType, endsAt: Date | null, now: Date): Prisma.AdUpdateInput {
    switch (type) {
      case PromotionProductType.BUMP_ONCE:
        return {
          boostedAt: now
        };
      case PromotionProductType.URGENT_BADGE:
        return {
          promotionUrgentUntil: endsAt
        };
      case PromotionProductType.PIN_CATEGORY:
        return {
          promotionPinnedUntil: endsAt
        };
      case PromotionProductType.HIGHLIGHT_CARD:
        return {
          promotionHighlightedUntil: endsAt
        };
      case PromotionProductType.RECOMMENDED:
        return {
          promotionRecommendedUntil: endsAt
        };
      case PromotionProductType.AUTO_BUMP:
        return {
          boostedAt: now
        };
    }
  }

  private getPromotionProductTitle(type: PromotionProductType): string {
    const titles: Record<PromotionProductType, string> = {
      BUMP_ONCE: 'Поднятие',
      URGENT_BADGE: 'Срочно',
      PIN_CATEGORY: 'Закрепление',
      HIGHLIGHT_CARD: 'Выделение',
      RECOMMENDED: 'Рекомендуемое',
      AUTO_BUMP: 'Автоподнятие'
    };

    return titles[type];
  }

  private getPaymentAmountValue(metadataJson: string | null, hasPaidMedia = false): string {
    const billing = this.getVacancyBillingMetadata(metadataJson);
    const mediaFeeRequired = billing?.mediaFeeRequired === true || billing?.mediaHighlight === true || hasPaidMedia;
    const packagePublications = this.getBillingPackagePublications(billing);

    if (billing?.paymentAmountValue && !mediaFeeRequired) {
      return billing.paymentAmountValue;
    }

    return getVacancyPublicationPaymentAmount({
      planCode: billing?.planCode,
      usesBalance: packagePublications === 0,
      mediaFeeRequired
    });
  }

  private getBillingPackagePublications(billing: VacancyBillingMetadata | null): number {
    if (billing?.source === 'credit') {
      return 0;
    }

    return Math.max(0, billing?.publications ?? getVacancyPublicationPlan(billing?.planCode).publications);
  }

  private getPaymentType(packagePublications: number, includesMediaFee: boolean): string {
    if (packagePublications > 0 && includesMediaFee) {
      return 'PACKAGE_PLUS_MEDIA';
    }

    if (packagePublications > 0) {
      return 'PACKAGE_PURCHASE';
    }

    if (includesMediaFee) {
      return 'MEDIA_FEE';
    }

    return 'VACANCY_PUBLICATION';
  }

  private getStoredPaymentPurpose(
    payment: {
      purposeCode?: string | null;
      purposeComponentsJson?: string | null;
    },
    fallback: {
      packagePublications: number;
      includesMediaFee: boolean;
    }
  ): PaymentPurposeClassification {
    let purposeComponents: unknown;

    if (payment.purposeComponentsJson) {
      try {
        purposeComponents = JSON.parse(payment.purposeComponentsJson) as unknown;
      } catch {
        purposeComponents = undefined;
      }
    }

    return normalizePaymentPurpose({
      purposeCode: payment.purposeCode,
      purposeComponents,
      packagePublications: fallback.packagePublications,
      includesMediaFee: fallback.includesMediaFee
    });
  }

  private getVacancyBillingMetadata(metadataJson: string | null): VacancyBillingMetadata | null {
    if (!metadataJson) {
      return null;
    }

    try {
      const metadata = JSON.parse(metadataJson) as { billing?: VacancyBillingMetadata };
      return metadata.billing?.purpose === VACANCY_PUBLICATION_PURPOSE ? metadata.billing : null;
    } catch {
      return null;
    }
  }

  private mergeVacancyBillingMetadata(metadataJson: string | null, billing: VacancyBillingMetadata): string {
    let metadata: Record<string, unknown> = {};

    if (metadataJson) {
      try {
        const parsed = JSON.parse(metadataJson) as unknown;
        metadata = isRecord(parsed) ? parsed : {};
      } catch {
        metadata = {};
      }
    }

    const mediaFeeRequired = billing.mediaFeeRequired === true || billing.mediaHighlight === true;

    return JSON.stringify({
      ...metadata,
      mediaHighlight: mediaFeeRequired,
      mediaFeeRequired,
      billing: {
        ...billing,
        mediaHighlight: mediaFeeRequired,
        mediaFeeRequired,
        createdAt: new Date().toISOString()
      }
    });
  }

  private async hasPaidMediaForAd(adId: string): Promise<boolean> {
    const media = await this.db.adPhoto.findMany({
      where: {
        adId,
        deletedAt: null
      },
      select: {
        id: true
      },
      take: 1
    });

    return requiresVacancyMediaFee(media);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
