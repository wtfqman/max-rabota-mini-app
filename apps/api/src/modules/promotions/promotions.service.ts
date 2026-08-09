import { randomUUID } from 'node:crypto';
import {
  AdStatus,
  AdType,
  PaymentStatus,
  PromotionProductType,
  type Ad,
  type AdPayment,
  type Prisma,
  type PrismaClient,
  type PromotionProduct,
  type PromotionPurchase
} from '@rabst24/db';
import { AppError, isValidPaymentConfirmationUrl, type AdTypeCode } from '@rabst24/shared';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { AdPaymentPayload } from '../payments/ad-payment.service.js';
import type { YooKassaClient } from '../payments/yookassa-client.js';
import type { CreatePromotionPurchaseDto, UpdatePromotionProductDto } from './promotions.schemas.js';

const PROMOTION_PRODUCT_TYPES = Object.values(PromotionProductType);
const ALL_AD_TYPES: AdTypeCode[] = ['vacancy', 'resume', 'equipment', 'material', 'tool'];
const PROMOTION_PURPOSE = 'AD_PROMOTION';

export interface PromotionProductDto {
  id: string | null;
  type: PromotionProductType;
  enabled: boolean;
  price: string | null;
  currency: string;
  durationHours: number | null;
  applicableAdTypes: AdTypeCode[];
  configuration: Record<string, unknown>;
  channelBehavior: Record<string, unknown>;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface PromotionPurchaseDto {
  id: string;
  adId: string;
  productId: string;
  productType: PromotionProductType;
  amount: string;
  currency: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  lastBumpedAt: string | null;
  createdAt: string;
  payment: AdPaymentPayload | null;
}

export class PromotionsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly yooKassaClient: YooKassaClient,
    private readonly settings: {
      enabled: boolean;
      currency: string;
      returnUrl: string;
      testMode: boolean;
    },
    private readonly notificationService?: NotificationService
  ) {}

  async listAvailableProductsForAd(userId: string, adId: string): Promise<PromotionProductDto[]> {
    const ad = await this.getOwnedPromotableAd(userId, adId);
    const products = await this.db.promotionProduct.findMany({
      where: {
        enabled: true,
        priceValue: {
          not: null
        }
      },
      orderBy: {
        type: 'asc'
      }
    });

    return products
      .filter((product) => product.durationHours || product.type === PromotionProductType.BUMP_ONCE)
      .filter((product) => this.isProductApplicable(product, ad.type))
      .map((product) => this.toProductDto(product));
  }

  async listPurchasesForAd(userId: string, adId: string): Promise<PromotionPurchaseDto[]> {
    await this.getOwnedAd(userId, adId);
    const purchases = await this.db.promotionPurchase.findMany({
      where: {
        adId,
        userId
      },
      include: {
        payment: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50
    });

    return purchases.map((purchase) => this.toPurchaseDto(purchase, purchase.payment));
  }

  async createPurchase(userId: string, adId: string, dto: CreatePromotionPurchaseDto): Promise<{
    purchase: PromotionPurchaseDto;
    payment: AdPaymentPayload | null;
  }> {
    const ad = await this.getOwnedPromotableAd(userId, adId);
    const product = await this.db.promotionProduct.findUnique({
      where: {
        type: dto.productType
      }
    });

    if (!product || !product.enabled || !product.priceValue || Number(product.priceValue) <= 0) {
      throw new AppError('Promotion product is unavailable', 404, {
        code: 'PROMOTION_PRODUCT_UNAVAILABLE',
        productType: dto.productType
      });
    }

    if (product.type !== PromotionProductType.BUMP_ONCE && !product.durationHours) {
      throw new AppError('Promotion product duration is not configured', 409, {
        code: 'PROMOTION_DURATION_REQUIRED',
        productType: dto.productType
      });
    }

    if (!this.isProductApplicable(product, ad.type)) {
      throw new AppError('Promotion product is not available for this ad type', 409, {
        code: 'PROMOTION_PRODUCT_NOT_APPLICABLE',
        productType: dto.productType,
        adType: ad.type
      });
    }

    const pending = await this.findReusablePendingPurchase(userId, adId, product.id);
    if (pending) {
      const dto = this.toPurchaseDto(pending, pending.payment);
      return {
        purchase: dto,
        payment: dto.payment
      };
    }

    if (!this.settings.enabled) {
      throw new AppError('YooKassa payment is required for promotion but is not configured', 503, {
        code: 'YOOKASSA_NOT_CONFIGURED',
        adId
      });
    }

    const idempotenceKey = `promotion:${userId}:${adId}:${product.id}:${randomUUID()}`;
    const payment = await this.yooKassaClient.createPayment(
      {
        amount: {
          value: product.priceValue,
          currency: product.currency
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: this.settings.returnUrl
        },
        description: `Promotion ${product.type} for ad ${ad.id}`,
        metadata: {
          purpose: PROMOTION_PURPOSE,
          adId: ad.id,
          ownerId: userId,
          productId: product.id,
          productType: product.type,
          purposeCode: PROMOTION_PURPOSE,
          paymentPurpose: PROMOTION_PURPOSE,
          paymentPurposeComponents: PROMOTION_PURPOSE
        },
        receipt: {
          customer: {
            email: 'payments@rabst24.ru'
          },
          items: [
            {
              description: `Продвижение объявления: ${this.getProductTitle(product.type)}`,
              quantity: '1.00',
              amount: {
                value: product.priceValue,
                currency: product.currency
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
    if (payment.status === 'pending' && !isValidPaymentConfirmationUrl(confirmationUrl)) {
      throw new AppError('YooKassa did not return a valid payment confirmation URL', 502, {
        code: 'YOOKASSA_CONFIRMATION_URL_INVALID',
        paymentId: payment.id
      });
    }

    const purchase = await this.db.$transaction(async (tx) => {
      const adPayment = await tx.adPayment.create({
        data: {
          adId: ad.id,
          yooKassaPaymentId: payment.id,
          idempotenceKey,
          status: this.mapPaymentStatus(payment.status),
          amountValue: product.priceValue ?? '0.00',
          currency: product.currency,
          confirmationUrl,
          paidAt: payment.status === 'succeeded' && payment.paid ? new Date() : undefined,
          rawPayloadJson: JSON.stringify(payment),
          purpose: PROMOTION_PURPOSE,
          purposeCode: PROMOTION_PURPOSE,
          purposeComponentsJson: JSON.stringify([PROMOTION_PURPOSE]),
          packagePublications: 0,
          includesMediaHighlight: false
        }
      });

      return tx.promotionPurchase.create({
        data: {
          userId,
          adId: ad.id,
          productId: product.id,
          productType: product.type,
          paymentId: adPayment.id,
          amountValue: product.priceValue ?? '0.00',
          currency: product.currency,
          status: adPayment.status,
          configurationSnapshotJson: product.configurationJson,
          channelBehaviorSnapshotJson: product.channelBehaviorJson
        },
        include: {
          payment: true
        }
      });
    });

    const purchaseDto = this.toPurchaseDto(purchase, purchase.payment);
    return {
      purchase: purchaseDto,
      payment: purchaseDto.payment
    };
  }

  async listAdminProducts(): Promise<PromotionProductDto[]> {
    const products = await this.db.promotionProduct.findMany();
    const byType = new Map(products.map((product) => [product.type, product]));

    return PROMOTION_PRODUCT_TYPES.map((type) => this.toProductDto(byType.get(type) ?? this.buildVirtualProduct(type)));
  }

  async updateAdminProduct(type: PromotionProductType, adminUserId: string, dto: UpdatePromotionProductDto): Promise<PromotionProductDto> {
    const existing = await this.db.promotionProduct.findUnique({
      where: {
        type
      }
    });

    const applicableAdTypes = dto.applicableAdTypes
      ? dto.applicableAdTypes
      : existing
        ? this.parseAdTypes(existing.applicableAdTypesJson)
        : [];

    const channelBehavior = dto.channelBehavior === undefined
      ? existing
        ? this.parseRecord(existing.channelBehaviorJson)
        : this.getDefaultChannelBehavior()
      : dto.channelBehavior ?? this.getDefaultChannelBehavior();

    const product = await this.db.promotionProduct.upsert({
      where: {
        type
      },
      update: {
        enabled: dto.enabled,
        priceValue: dto.price,
        durationHours: dto.durationHours,
        applicableAdTypesJson: JSON.stringify(applicableAdTypes),
        configurationJson: dto.configuration === undefined ? undefined : JSON.stringify(dto.configuration ?? {}),
        channelBehaviorJson: JSON.stringify(channelBehavior),
        updatedById: adminUserId
      },
      create: {
        type,
        enabled: dto.enabled ?? false,
        priceValue: dto.price ?? null,
        durationHours: dto.durationHours ?? null,
        applicableAdTypesJson: JSON.stringify(applicableAdTypes),
        configurationJson: JSON.stringify(dto.configuration ?? {}),
        channelBehaviorJson: JSON.stringify(channelBehavior),
        updatedById: adminUserId
      }
    });

    return this.toProductDto(product);
  }

  async expireExpiredPromotions(now = new Date()): Promise<{ clearedAds: number; notified: number }> {
    const expired = await this.db.promotionPurchase.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        endsAt: {
          lt: now
        }
      },
      include: {
        ad: {
          select: {
            title: true
          }
        }
      },
      take: 500
    });

    await this.clearExpiredAdFields(now);

    let notified = 0;
    for (const purchase of expired) {
      if (!this.notificationService) {
        continue;
      }

      await this.notificationService.notify({
        userId: purchase.userId,
        type: 'PROMOTION_EXPIRED',
        title: 'Продвижение завершено',
        body: `${this.getProductTitle(purchase.productType)} для объявления «${purchase.ad.title}» завершено.`,
        category: 'payments',
        idempotencyKey: `promotion:${purchase.id}:expired`,
        deepLink: this.notificationService.buildAdLink(purchase.adId),
        payload: {
          promotionPurchaseId: purchase.id,
          adId: purchase.adId,
          productType: purchase.productType
        }
      });
      notified += 1;
    }

    return {
      clearedAds: expired.length,
      notified
    };
  }

  async runAutoBumps(now = new Date()): Promise<{ bumped: number }> {
    const candidates = await this.db.promotionPurchase.findMany({
      where: {
        productType: PromotionProductType.AUTO_BUMP,
        status: PaymentStatus.SUCCEEDED,
        startsAt: {
          lte: now
        },
        endsAt: {
          gt: now
        }
      },
      take: 100
    });

    let bumped = 0;
    for (const purchase of candidates) {
      const config = this.parseRecord(purchase.configurationSnapshotJson);
      const intervalHours = this.getPositiveNumber(config.bumpIntervalHours) ?? 24;
      const nextAllowedAt = purchase.lastBumpedAt
        ? new Date(purchase.lastBumpedAt.getTime() + intervalHours * 60 * 60 * 1000)
        : purchase.createdAt;

      if (nextAllowedAt > now) {
        continue;
      }

      await this.db.$transaction([
        this.db.promotionPurchase.update({
          where: {
            id: purchase.id
          },
          data: {
            lastBumpedAt: now
          }
        }),
        this.db.ad.update({
          where: {
            id: purchase.adId
          },
          data: {
            boostedAt: now
          }
        })
      ]);
      bumped += 1;
    }

    return {
      bumped
    };
  }

  private async getOwnedAd(userId: string, adId: string): Promise<Pick<Ad, 'id' | 'ownerId' | 'type' | 'status' | 'deletedAt' | 'hiddenAt' | 'archivedAt'>> {
    const ad = await this.db.ad.findFirst({
      where: {
        id: adId,
        ownerId: userId,
        deletedAt: null
      },
      select: {
        id: true,
        ownerId: true,
        type: true,
        status: true,
        deletedAt: true,
        hiddenAt: true,
        archivedAt: true
      }
    });

    if (!ad) {
      throw new AppError('Ad not found', 404, {
        code: 'AD_NOT_FOUND',
        adId
      });
    }

    return ad;
  }

  private async getOwnedPromotableAd(userId: string, adId: string): Promise<Pick<Ad, 'id' | 'ownerId' | 'type' | 'status' | 'deletedAt' | 'hiddenAt' | 'archivedAt'>> {
    const ad = await this.getOwnedAd(userId, adId);
    const isPublic = ad.status === AdStatus.APPROVED || ad.status === AdStatus.PUBLISHED;

    if (!isPublic || ad.deletedAt || ad.hiddenAt || ad.archivedAt) {
      throw new AppError('Only active published ads can be promoted', 409, {
        code: 'AD_NOT_PROMOTABLE',
        adId,
        status: ad.status.toLowerCase()
      });
    }

    return ad;
  }

  private async findReusablePendingPurchase(userId: string, adId: string, productId: string) {
    return this.db.promotionPurchase.findFirst({
      where: {
        userId,
        adId,
        productId,
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.WAITING_FOR_CAPTURE]
        },
        payment: {
          is: {
            confirmationUrl: {
              not: null
            }
          }
        }
      },
      include: {
        payment: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  private async clearExpiredAdFields(now: Date): Promise<void> {
    await this.db.$transaction([
      this.db.ad.updateMany({
        where: {
          promotionPinnedUntil: {
            lt: now
          }
        },
        data: {
          promotionPinnedUntil: null
        }
      }),
      this.db.ad.updateMany({
        where: {
          promotionUrgentUntil: {
            lt: now
          }
        },
        data: {
          promotionUrgentUntil: null
        }
      }),
      this.db.ad.updateMany({
        where: {
          promotionHighlightedUntil: {
            lt: now
          }
        },
        data: {
          promotionHighlightedUntil: null
        }
      }),
      this.db.ad.updateMany({
        where: {
          promotionRecommendedUntil: {
            lt: now
          }
        },
        data: {
          promotionRecommendedUntil: null
        }
      })
    ]);
  }

  private toProductDto(product: PromotionProduct | ReturnType<PromotionsService['buildVirtualProduct']>): PromotionProductDto {
    return {
      id: product.id,
      type: product.type,
      enabled: product.enabled,
      price: product.priceValue,
      currency: product.currency,
      durationHours: product.durationHours,
      applicableAdTypes: this.parseAdTypes(product.applicableAdTypesJson),
      configuration: this.parseRecord(product.configurationJson),
      channelBehavior: this.parseRecord(product.channelBehaviorJson) ?? this.getDefaultChannelBehavior(),
      updatedBy: product.updatedById,
      updatedAt: product.updatedAt?.toISOString() ?? null
    };
  }

  private toPurchaseDto(purchase: PromotionPurchase, payment?: AdPayment | null): PromotionPurchaseDto {
    return {
      id: purchase.id,
      adId: purchase.adId,
      productId: purchase.productId,
      productType: purchase.productType,
      amount: purchase.amountValue,
      currency: purchase.currency,
      status: purchase.status.toLowerCase(),
      startsAt: purchase.startsAt?.toISOString() ?? null,
      endsAt: purchase.endsAt?.toISOString() ?? null,
      lastBumpedAt: purchase.lastBumpedAt?.toISOString() ?? null,
      createdAt: purchase.createdAt.toISOString(),
      payment: payment ? this.toPaymentPayload(payment) : null
    };
  }

  private toPaymentPayload(payment: AdPayment): AdPaymentPayload {
    return {
      id: payment.id,
      paymentId: payment.yooKassaPaymentId,
      status: payment.status.toLowerCase(),
      amount: payment.amountValue,
      currency: payment.currency,
      confirmationUrl: payment.confirmationUrl,
      test: this.settings.testMode
    };
  }

  private isProductApplicable(product: Pick<PromotionProduct, 'applicableAdTypesJson'>, adType: AdType): boolean {
    const allowed = this.parseAdTypes(product.applicableAdTypesJson);

    if (allowed.length === 0) {
      return true;
    }

    return allowed.includes(this.toAdTypeCode(adType));
  }

  private parseAdTypes(value: string | null | undefined): AdTypeCode[] {
    const parsed = this.parseJson(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is AdTypeCode => ALL_AD_TYPES.includes(item as AdTypeCode));
  }

  private parseRecord(value: string | null | undefined): Record<string, unknown> {
    const parsed = this.parseJson(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  }

  private parseJson(value: string | null | undefined): unknown {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  private getDefaultChannelBehavior(): Record<string, unknown> {
    return {
      showBadgesInMax: true,
      showBadgesInTelegram: true,
      autoBumpChannels: 'NONE'
    };
  }

  private getPositiveNumber(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private getProductTitle(type: PromotionProductType): string {
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

  private buildVirtualProduct(type: PromotionProductType) {
    return {
      id: null,
      type,
      enabled: false,
      priceValue: null,
      currency: this.settings.currency,
      durationHours: null,
      applicableAdTypesJson: '[]',
      configurationJson: '{}',
      channelBehaviorJson: JSON.stringify(this.getDefaultChannelBehavior()),
      updatedById: null,
      updatedAt: null
    };
  }

  private toAdTypeCode(value: AdType): AdTypeCode {
    const map: Record<AdType, AdTypeCode> = {
      VACANCY: 'vacancy',
      RESUME: 'resume',
      EQUIPMENT: 'equipment',
      MATERIAL: 'material',
      TOOL: 'tool'
    };

    return map[value];
  }

  private mapPaymentStatus(status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'): PaymentStatus {
    if (status === 'succeeded') {
      return PaymentStatus.SUCCEEDED;
    }

    if (status === 'waiting_for_capture') {
      return PaymentStatus.WAITING_FOR_CAPTURE;
    }

    if (status === 'canceled') {
      return PaymentStatus.CANCELED;
    }

    return PaymentStatus.PENDING;
  }
}

export function getPromotionAdUpdate(type: PromotionProductType, endsAt: Date | null, now: Date): Prisma.AdUpdateInput {
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
