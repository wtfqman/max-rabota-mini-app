import { PaymentStatus, type Prisma, type PrismaClient } from '@rabst24/db';
import { normalizePaymentPurpose, type PaymentPurposeCode } from '@rabst24/shared';

type PaymentRecord = Awaited<ReturnType<PaymentHistoryService['findPayments']>>[number];
type FinanceStatus =
  | 'PENDING'
  | 'SUCCEEDED'
  | 'CANCELED'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'FAILED';

const financeStatuses: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.WAITING_FOR_CAPTURE,
  PaymentStatus.SUCCEEDED,
  PaymentStatus.CANCELED,
  PaymentStatus.REFUNDED
];

export class PaymentHistoryService {
  constructor(private readonly db: PrismaClient) {}

  async listUserHistory(userId: string, query: { page?: number; perPage?: number } = {}) {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 30;
    const where: Prisma.AdPaymentWhereInput = {
      OR: [
        {
          ad: {
            ownerId: userId
          }
        },
        {
          resumeContactUnlock: {
            is: {
              buyerUserId: userId
            }
          }
        },
        {
          promotionPurchase: {
            is: {
              userId
            }
          }
        }
      ],
      AND: [
        productionPaymentWhere()
      ]
    };
    const [items, total] = await this.db.$transaction([
      this.findPayments({
        where,
        orderBy: {
          createdAt: 'desc'
        },
        skip: (page - 1) * perPage,
        take: perPage
      }),
      this.db.adPayment.count({
        where
      })
    ]);
    const productionItems = items.filter((payment) => !isTestPayment(payment.rawPayloadJson));
    const visibleTotal = total - (items.length - productionItems.length);

    return {
      items: productionItems.map((payment) => this.serializePayment(payment)),
      meta: {
        page,
        perPage,
        total: visibleTotal,
        totalPages: Math.ceil(visibleTotal / perPage)
      }
    };
  }

  async getAdminDashboard(query: { from?: string; to?: string } = {}) {
    const selectedPeriod = getPeriodRange(query);
    const [today, sevenDays, thirtyDays, selected] = await Promise.all([
      this.calculateMetrics(getRelativeRange(1)),
      this.calculateMetrics(getRelativeRange(7)),
      this.calculateMetrics(getRelativeRange(30)),
      this.calculateMetrics(selectedPeriod)
    ]);

    return {
      today,
      sevenDays,
      thirtyDays,
      selectedPeriod: {
        from: selectedPeriod.from.toISOString(),
        to: selectedPeriod.to.toISOString(),
        ...selected
      }
    };
  }

  async exportAdminCsv(query: { from?: string; to?: string } = {}) {
    const range = getPeriodRange(query);
    const payments = await this.findPayments({
      where: {
        createdAt: {
          gte: range.from,
          lt: range.to
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    const rows = payments
      .filter((payment) => !isTestPayment(payment.rawPayloadJson))
      .map((payment) => {
        const serialized = this.serializePayment(payment);

        return [
          `${formatDateOnly(range.from)}..${formatDateOnly(addMilliseconds(range.to, -1))}`,
          payment.yooKassaPaymentId,
          payment.ad.owner.id,
          getUserLabel(payment.ad.owner),
          serialized.purpose.primary,
          serialized.amount,
          serialized.refundAmount,
          serialized.netAmount,
          serialized.status,
          serialized.createdAt
        ];
      });

    return [
      ['period', 'paymentId', 'userId', 'user', 'purpose', 'amount', 'refund', 'net', 'status', 'createdAt'],
      ...rows
    ]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');
  }

  async calculateMetrics(range: { from: Date; to: Date }, includeTest = false) {
    const payments = (
      await this.findPayments({
        where: {
          createdAt: {
            gte: range.from,
            lt: range.to
          },
          status: {
            in: financeStatuses
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
    ).filter((payment) => includeTest || !isTestPayment(payment.rawPayloadJson));

    let revenueCents = 0;
    let refundsCents = 0;
    let succeededCount = 0;
    const byPurpose = new Map<string, { purpose: string; revenueCents: number; refundCents: number; netCents: number; count: number }>();
    const tariffs = new Map<string, { label: string; count: number; revenueCents: number }>();
    let revenuePromotionsCents = 0;
    let revenueContactUnlocksCents = 0;
    let paymentErrors = 0;
    let pendingPayments = 0;

    for (const payment of payments) {
      const serialized = this.serializePayment(payment);
      const amountCents = moneyToCents(payment.amountValue);
      const refundCents = moneyToCents(serialized.refundAmount);
      const isSucceeded = payment.status === PaymentStatus.SUCCEEDED || payment.status === PaymentStatus.REFUNDED;

      if (isSucceeded) {
        succeededCount += 1;
        revenueCents += amountCents;
        refundsCents += refundCents;
      }

      if (serialized.status === 'FAILED' || serialized.status === 'CANCELED') {
        paymentErrors += 1;
      }

      if (serialized.status === 'PENDING' || serialized.status === 'REFUND_PENDING') {
        pendingPayments += 1;
      }

      const purpose = serialized.purpose.primary;

      if (isSucceeded) {
        const purposeMetric = byPurpose.get(purpose) ?? {
          purpose,
          revenueCents: 0,
          refundCents: 0,
          netCents: 0,
          count: 0
        };

        purposeMetric.count += 1;
        purposeMetric.revenueCents += amountCents;
        purposeMetric.refundCents += refundCents;
        purposeMetric.netCents += amountCents - refundCents;

        byPurpose.set(purpose, purposeMetric);
      }

      if (purpose === 'AD_PROMOTION' && isSucceeded) {
        revenuePromotionsCents += amountCents - refundCents;
      }

      if (purpose === 'RESUME_CONTACT_UNLOCK' && isSucceeded) {
        revenueContactUnlocksCents += amountCents - refundCents;
      }

      if (isSucceeded && serialized.packagePublications > 0) {
        const label = `${serialized.packagePublications} publications`;
        const tariff = tariffs.get(label) ?? {
          label,
          count: 0,
          revenueCents: 0
        };
        tariff.count += 1;
        tariff.revenueCents += amountCents - refundCents;
        tariffs.set(label, tariff);
      }
    }

    const netCents = revenueCents - refundsCents;

    return {
      revenue: centsToMoney(revenueCents),
      succeededPayments: succeededCount,
      averageCheck: centsToMoney(succeededCount > 0 ? Math.round(revenueCents / succeededCount) : 0),
      refunds: centsToMoney(refundsCents),
      netRevenue: centsToMoney(netCents),
      revenueByPurpose: Array.from(byPurpose.values()).map((item) => ({
        purpose: item.purpose,
        revenue: centsToMoney(item.revenueCents),
        refunds: centsToMoney(item.refundCents),
        netRevenue: centsToMoney(item.netCents),
        count: item.count
      })),
      popularTariffs: Array.from(tariffs.values())
        .sort((left, right) => right.count - left.count)
        .map((item) => ({
          label: item.label,
          count: item.count,
          revenue: centsToMoney(item.revenueCents)
        })),
      revenuePromotions: centsToMoney(revenuePromotionsCents),
      revenueContactUnlocks: centsToMoney(revenueContactUnlocksCents),
      paymentErrors,
      pendingPayments
    };
  }

  findPayments(args: Prisma.AdPaymentFindManyArgs) {
    return this.db.adPayment.findMany({
      ...args,
      include: {
        ad: {
          select: {
            id: true,
            title: true,
            type: true,
            owner: {
              select: {
                id: true,
                displayName: true,
                firstName: true,
                lastName: true,
                maxUsername: true
              }
            }
          }
        },
        resumeContactUnlock: {
          select: {
            id: true,
            buyerUserId: true,
            resumeAdId: true,
            status: true
          }
        },
        promotionPurchase: {
          select: {
            id: true,
            userId: true,
            productType: true,
            status: true
          }
        }
      }
    });
  }

  serializePayment(payment: PaymentRecord) {
    const purpose = normalizeStoredPurpose(payment);
    const refundAmount = getRefundAmount(payment);
    const amountCents = moneyToCents(payment.amountValue);
    const netCents = isRevenueStatus(payment.status) ? amountCents - getCompletedRefundCents(payment) : 0;

    return {
      id: payment.id,
      createdAt: payment.createdAt.toISOString(),
      paidAt: payment.paidAt?.toISOString() ?? null,
      amount: centsToMoney(amountCents),
      currency: payment.currency,
      refundAmount,
      netAmount: centsToMoney(netCents),
      purpose,
      purposeLabel: getPurposeLabel(purpose.primary),
      packagePublications: payment.packagePublications,
      includesMediaFee: purpose.components.includes('VACANCY_MEDIA_FEE') || payment.includesMediaHighlight,
      isResumeContactUnlock: purpose.components.includes('RESUME_CONTACT_UNLOCK'),
      isPromotion: purpose.components.includes('AD_PROMOTION'),
      status: getFinanceStatus(payment),
      yooKassaPaymentIdMasked: maskPaymentId(payment.yooKassaPaymentId),
      test: isTestPayment(payment.rawPayloadJson),
      ad: {
        id: payment.ad.id,
        title: payment.ad.title,
        type: payment.ad.type.toLowerCase()
      },
      resumeContactUnlock: payment.resumeContactUnlock
        ? {
            id: payment.resumeContactUnlock.id,
            resumeAdId: payment.resumeContactUnlock.resumeAdId,
            status: payment.resumeContactUnlock.status.toLowerCase()
          }
        : null,
      promotion: payment.promotionPurchase
        ? {
            id: payment.promotionPurchase.id,
            productType: payment.promotionPurchase.productType
          }
        : null
    };
  }
}

function normalizeStoredPurpose(payment: {
  purposeCode?: string | null;
  purposeComponentsJson?: string | null;
  packagePublications: number;
  includesMediaHighlight: boolean;
}) {
  let components: unknown;

  if (payment.purposeComponentsJson) {
    try {
      components = JSON.parse(payment.purposeComponentsJson) as unknown;
    } catch {
      components = undefined;
    }
  }

  return normalizePaymentPurpose({
    purposeCode: payment.purposeCode,
    purposeComponents: components,
    packagePublications: payment.packagePublications,
    includesMediaFee: payment.includesMediaHighlight
  });
}

function getFinanceStatus(payment: {
  status: PaymentStatus;
  rawPayloadJson: string | null;
  refundPayloadJson: string | null;
  refundedAt: Date | null;
  amountValue: string;
  yooKassaRefundId: string | null;
}): FinanceStatus {
  const remoteStatus = parseJsonRecord(payment.rawPayloadJson)?.status;

  if (remoteStatus === 'failed') {
    return 'FAILED';
  }

  if (payment.status === PaymentStatus.CANCELED) {
    return 'CANCELED';
  }

  if (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.WAITING_FOR_CAPTURE) {
    return 'PENDING';
  }

  const refundPayload = parseJsonRecord(payment.refundPayloadJson);
  const refundStatus = typeof refundPayload?.status === 'string' ? refundPayload.status : null;
  const refundCents = moneyToCents(getRefundAmount(payment));

  if (payment.yooKassaRefundId && !payment.refundedAt && refundStatus !== 'succeeded') {
    return 'REFUND_PENDING';
  }

  if (payment.status === PaymentStatus.REFUNDED || payment.refundedAt || refundStatus === 'succeeded') {
    return refundCents > 0 && refundCents < moneyToCents(payment.amountValue) ? 'PARTIALLY_REFUNDED' : 'REFUNDED';
  }

  return 'SUCCEEDED';
}

function getRefundAmount(payment: {
  amountValue: string;
  refundPayloadJson: string | null;
  refundedAt: Date | null;
  yooKassaRefundId: string | null;
}): string {
  const refund = parseJsonRecord(payment.refundPayloadJson);
  const amount = parseJsonRecord(refund?.amount);
  const value = amount?.value;

  if (typeof value === 'string' && Number(value) > 0) {
    return centsToMoney(moneyToCents(value));
  }

  if (payment.refundedAt && payment.yooKassaRefundId) {
    return centsToMoney(moneyToCents(payment.amountValue));
  }

  return '0.00';
}

function getCompletedRefundCents(payment: {
  amountValue: string;
  refundPayloadJson: string | null;
  refundedAt: Date | null;
  yooKassaRefundId: string | null;
}): number {
  const refund = parseJsonRecord(payment.refundPayloadJson);
  const status = refund?.status;

  if (status && status !== 'succeeded') {
    return 0;
  }

  return moneyToCents(getRefundAmount(payment));
}

function isRevenueStatus(status: PaymentStatus): boolean {
  return status === PaymentStatus.SUCCEEDED || status === PaymentStatus.REFUNDED;
}

function isTestPayment(rawPayloadJson: string | null): boolean {
  return parseJsonRecord(rawPayloadJson)?.test === true;
}

function productionPaymentWhere(): Prisma.AdPaymentWhereInput {
  return {
    AND: [
      {
        OR: [
          { rawPayloadJson: null },
          {
            rawPayloadJson: {
              not: {
                contains: '"test":true'
              }
            }
          }
        ]
      },
      {
        OR: [
          { rawPayloadJson: null },
          {
            rawPayloadJson: {
              not: {
                contains: '"test": true'
              }
            }
          }
        ]
      }
    ]
  };
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function maskPaymentId(paymentId: string): string {
  if (paymentId.length <= 8) {
    return `${paymentId.slice(0, 2)}***${paymentId.slice(-2)}`;
  }

  return `${paymentId.slice(0, 6)}***${paymentId.slice(-4)}`;
}

function moneyToCents(value: string | number): number {
  const [rubles = '0', kopecks = ''] = String(value).split('.');
  const sign = rubles.trim().startsWith('-') ? -1 : 1;
  const absRubles = Math.abs(Number.parseInt(rubles, 10) || 0);
  const normalizedKopecks = `${kopecks}00`.slice(0, 2);
  return sign * (absRubles * 100 + (Number.parseInt(normalizedKopecks, 10) || 0));
}

function centsToMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function getPurposeLabel(purpose: PaymentPurposeCode): string {
  const labels: Record<string, string> = {
    VACANCY_PACKAGE: 'Пакет публикаций вакансий',
    VACANCY_MEDIA_FEE: 'Медиа в вакансии',
    RESUME_CONTACT_UNLOCK: 'Открытие контакта резюме',
    AD_PROMOTION: 'Продвижение объявления'
  };

  return labels[purpose] ?? purpose;
}

function getPeriodRange(query: { from?: string; to?: string }) {
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : getRelativeRange(30).from;
  const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : getRelativeRange(30).to;

  return {
    from,
    to: addMilliseconds(to, 1)
  };
}

function getRelativeRange(days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days + 1);
  from.setUTCHours(0, 0, 0, 0);

  return {
    from,
    to
  };
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function getUserLabel(user: { displayName: string | null; firstName: string | null; lastName: string | null; maxUsername: string | null }): string {
  return user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.maxUsername || '');
}
