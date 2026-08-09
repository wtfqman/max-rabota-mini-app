import { createHash } from 'node:crypto';
import { AdStatus, UserStatus, AdType, type PrismaClient } from '@rabst24/db';
import { AppError } from '@rabst24/shared';
import type { AdAnalyticsEventDto, AdAnalyticsEventType } from './ad-analytics.schemas.js';

type MetricTotals = {
  views: number;
  uniqueViews: number;
  favoriteAdds: number;
  favoriteRemoves: number;
  contactOpens: number;
  phoneClicks: number;
  emailClicks: number;
  maxClicks: number;
  websiteClicks: number;
  applications: number;
  contactUnlocks: number;
  promotionPurchases: number;
};

export interface OwnerAdAnalyticsSummary {
  days: number;
  totals: MetricTotals;
  conversion: {
    viewToContact: number;
    viewToApplication: number;
  };
  series: Array<{
    date: string;
    views: number;
    uniqueViews: number;
    contactOpens: number;
    applications: number;
  }>;
  recommendations: Array<{
    code: string;
    title: string;
    body: string;
  }>;
}

const ZERO_TOTALS: MetricTotals = {
  views: 0,
  uniqueViews: 0,
  favoriteAdds: 0,
  favoriteRemoves: 0,
  contactOpens: 0,
  phoneClicks: 0,
  emailClicks: 0,
  maxClicks: 0,
  websiteClicks: 0,
  applications: 0,
  contactUnlocks: 0,
  promotionPurchases: 0
};

export interface AnalyticsActor {
  userId?: string | null;
  role?: string | null;
  sessionId?: string | null;
  userAgent?: string | null;
}

export class AdAnalyticsService {
  constructor(private readonly db: PrismaClient) {}

  async recordEvent(dto: AdAnalyticsEventDto, actor: AnalyticsActor = {}): Promise<{ recorded: boolean; uniqueView: boolean }> {
    await this.assertActorCanRecord(actor);

    const ad = await this.db.ad.findFirst({
      where: this.buildPublicAdWhere(dto.adId),
      select: {
        id: true
      }
    });

    if (!ad) {
      throw new AppError('Ad is not available for analytics', 404, {
        code: 'AD_ANALYTICS_AD_NOT_FOUND',
        adId: dto.adId
      });
    }

    const isInternal = dto.internal === true || this.isInternalTraffic(actor.userAgent);
    const date = this.getDayStart();
    const increments: Partial<MetricTotals> & { internalEvents?: number } = isInternal
      ? { internalEvents: 1 }
      : this.getIncrements(dto.eventType);
    let uniqueView = false;

    if (!isInternal && dto.eventType === 'card_open') {
      uniqueView = await this.tryCreateUniqueView(dto.adId, date, this.getVisitorHash(dto, actor, date));
      if (uniqueView) {
        increments.uniqueViews = 1;
      }
    }

    await this.incrementDaily(dto.adId, date, increments);

    return {
      recorded: true,
      uniqueView
    };
  }

  async recordSystemEvent(adId: string, eventType: AdAnalyticsEventType, date = new Date()): Promise<void> {
    const ad = await this.db.ad.findFirst({
      where: this.buildPublicAdWhere(adId),
      select: {
        id: true
      }
    });

    if (!ad) {
      return;
    }

    await this.incrementDaily(adId, this.getDayStart(date), this.getIncrements(eventType));
  }

  async summarizeOwnedAds(ownerId: string, adIds: string[], days = 30): Promise<Map<string, OwnerAdAnalyticsSummary>> {
    if (adIds.length === 0) {
      return new Map();
    }

    const since = this.getDayStart(this.addDays(new Date(), -(days - 1)));
    const rows = await this.db.adMetricDaily.findMany({
      where: {
        adId: {
          in: adIds
        },
        date: {
          gte: since
        },
        ad: {
          ownerId
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    const byAd = new Map<string, typeof rows>();
    for (const row of rows) {
      byAd.set(row.adId, [...(byAd.get(row.adId) ?? []), row]);
    }

    return new Map(adIds.map((adId) => [adId, this.buildOwnerSummary(byAd.get(adId) ?? [], days)]));
  }

  async getOwnerDashboard(ownerId: string, adId: string, days = 30) {
    const ad = await this.db.ad.findFirst({
      where: {
        id: adId,
        ownerId,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!ad) {
      throw new AppError('Ad not found', 404, {
        code: 'AD_NOT_FOUND',
        adId
      });
    }

    const summaries = await this.summarizeOwnedAds(ownerId, [adId], days);
    return summaries.get(adId) ?? this.buildOwnerSummary([], days);
  }

  async getAdminDashboard(days = 30) {
    const since = this.getDayStart(this.addDays(new Date(), -(days - 1)));
    const publicAdWhere = {
      status: {
        in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
      },
      deletedAt: null,
      hiddenAt: null,
      archivedAt: null,
      isTest: false
    };
    const [metricRows, activeUsers, publishedAds, publishedAdRows, topAds] = await Promise.all([
      this.db.adMetricDaily.findMany({
        where: {
          date: {
            gte: since
          }
        }
      }),
      this.db.user.count({
        where: {
          status: UserStatus.ACTIVE,
          deletedAt: null,
          lastSeenAt: {
            gte: since
          }
        }
      }),
      this.db.ad.count({
        where: publicAdWhere
      }),
      this.db.ad.findMany({
        where: publicAdWhere,
        select: {
          id: true,
          type: true,
          categoryText: true,
          vacancyDetails: {
            select: {
              position: true
            }
          },
          resumeDetails: {
            select: {
              profession: true,
              desiredPosition: true
            }
          }
        },
        take: 1000
      }),
      this.db.ad.findMany({
        where: {
          metricDaily: {
            some: {
              date: {
                gte: since
              }
            }
          }
        },
        select: {
          id: true,
          title: true,
          type: true,
          categoryText: true,
          metricDaily: {
            where: {
              date: {
                gte: since
              }
            }
          }
        },
        take: 100
      })
    ]);

    const totals = this.sumRows(metricRows);
    const popularCategories = this.getPopularCategories(publishedAdRows);
    /*
      type: this.toAdTypeCode(row.type),
      category: row.categoryText ?? 'Без категории',
      ads: row._count._all
    */
    const popularProfessions = this.getPopularProfessions(publishedAdRows);
    const top = topAds
      .map((ad) => ({
        id: ad.id,
        title: ad.title,
        type: this.toAdTypeCode(ad.type),
        category: ad.categoryText,
        totals: this.sumRows(ad.metricDaily)
      }))
      .sort((left, right) => right.totals.views - left.totals.views)
      .slice(0, 10);

    return {
      days,
      activeUsers,
      publishedAds,
      totals,
      conversion: this.getConversion(totals),
      popularCategories,
      popularProfessions,
      topAds: top
    };
  }

  private async incrementDaily(adId: string, date: Date, increments: Partial<MetricTotals> & { internalEvents?: number }): Promise<void> {
    await this.db.adMetricDaily.upsert({
      where: {
        adId_date: {
          adId,
          date
        }
      },
      create: {
        adId,
        date,
        views: increments.views ?? 0,
        uniqueViews: increments.uniqueViews ?? 0,
        favoriteAdds: increments.favoriteAdds ?? 0,
        favoriteRemoves: increments.favoriteRemoves ?? 0,
        contactOpens: increments.contactOpens ?? 0,
        phoneClicks: increments.phoneClicks ?? 0,
        emailClicks: increments.emailClicks ?? 0,
        maxClicks: increments.maxClicks ?? 0,
        websiteClicks: increments.websiteClicks ?? 0,
        applications: increments.applications ?? 0,
        contactUnlocks: increments.contactUnlocks ?? 0,
        promotionPurchases: increments.promotionPurchases ?? 0,
        internalEvents: increments.internalEvents ?? 0
      },
      update: Object.fromEntries(
        Object.entries(increments).map(([key, value]) => [key, { increment: value }])
      ) as never
    });
  }

  private async tryCreateUniqueView(adId: string, date: Date, visitorHash: string): Promise<boolean> {
    try {
      await this.db.adMetricUniqueView.create({
        data: {
          adId,
          date,
          visitorHash
        }
      });
      return true;
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'P2002') {
        return false;
      }

      throw error;
    }
  }

  private getIncrements(eventType: AdAnalyticsEventType): Partial<MetricTotals> {
    const map: Record<AdAnalyticsEventType, Partial<MetricTotals>> = {
      card_open: {
        views: 1
      },
      favorite_add: {
        favoriteAdds: 1
      },
      favorite_remove: {
        favoriteRemoves: 1
      },
      contact_open: {
        contactOpens: 1
      },
      phone_click: {
        phoneClicks: 1
      },
      email_click: {
        emailClicks: 1
      },
      max_click: {
        maxClicks: 1
      },
      website_click: {
        websiteClicks: 1
      },
      application_sent: {
        applications: 1
      },
      resume_contact_unlock_purchased: {
        contactUnlocks: 1
      },
      promotion_purchased: {
        promotionPurchases: 1
      }
    };

    return { ...map[eventType] };
  }

  private buildOwnerSummary(rows: Array<{ date: Date } & Partial<MetricTotals>>, days: number): OwnerAdAnalyticsSummary {
    const totals = this.sumRows(rows);

    return {
      days,
      totals,
      conversion: this.getConversion(totals),
      series: this.buildSeries(rows, days),
      recommendations: this.getRecommendations(totals)
    };
  }

  private buildSeries(rows: Array<{ date: Date } & Partial<MetricTotals>>, days: number) {
    const byDate = new Map(rows.map((row) => [this.formatDateKey(row.date), row]));

    return Array.from({ length: days }, (_item, index) => {
      const date = this.getDayStart(this.addDays(new Date(), index - (days - 1)));
      const row = byDate.get(this.formatDateKey(date));

      return {
        date: this.formatDateKey(date),
        views: row?.views ?? 0,
        uniqueViews: row?.uniqueViews ?? 0,
        contactOpens: row?.contactOpens ?? 0,
        applications: row?.applications ?? 0
      };
    });
  }

  private sumRows(rows: Array<Partial<MetricTotals>>): MetricTotals {
    return rows.reduce<MetricTotals>((sum, row) => ({
      views: sum.views + (row.views ?? 0),
      uniqueViews: sum.uniqueViews + (row.uniqueViews ?? 0),
      favoriteAdds: sum.favoriteAdds + (row.favoriteAdds ?? 0),
      favoriteRemoves: sum.favoriteRemoves + (row.favoriteRemoves ?? 0),
      contactOpens: sum.contactOpens + (row.contactOpens ?? 0),
      phoneClicks: sum.phoneClicks + (row.phoneClicks ?? 0),
      emailClicks: sum.emailClicks + (row.emailClicks ?? 0),
      maxClicks: sum.maxClicks + (row.maxClicks ?? 0),
      websiteClicks: sum.websiteClicks + (row.websiteClicks ?? 0),
      applications: sum.applications + (row.applications ?? 0),
      contactUnlocks: sum.contactUnlocks + (row.contactUnlocks ?? 0),
      promotionPurchases: sum.promotionPurchases + (row.promotionPurchases ?? 0)
    }), { ...ZERO_TOTALS });
  }

  private getConversion(totals: MetricTotals) {
    const contactActions = totals.contactOpens + totals.phoneClicks + totals.emailClicks + totals.maxClicks + totals.websiteClicks;

    return {
      viewToContact: this.toPercent(contactActions, totals.views),
      viewToApplication: this.toPercent(totals.applications, totals.views)
    };
  }

  private getPopularCategories(
    ads: Array<{ type: AdType; categoryText: string | null }>
  ): Array<{ type: string; category: string; ads: number }> {
    const counts = new Map<string, { type: string; category: string; ads: number }>();

    for (const ad of ads) {
      const type = this.toAdTypeCode(ad.type);
      const category = ad.categoryText ?? 'Без категории';
      const key = `${type}:${category}`;
      const current = counts.get(key);

      counts.set(key, {
        type,
        category,
        ads: (current?.ads ?? 0) + 1
      });
    }

    return [...counts.values()].sort((left, right) => right.ads - left.ads).slice(0, 20);
  }

  private getPopularProfessions(
    ads: Array<{
      type: AdType;
      vacancyDetails: { position: string | null } | null;
      resumeDetails: { profession: string | null; desiredPosition: string | null } | null;
    }>
  ): Array<{ type: string; profession: string; ads: number }> {
    const counts = new Map<string, { type: string; profession: string; ads: number }>();

    for (const ad of ads) {
      if (ad.type !== AdType.VACANCY && ad.type !== AdType.RESUME) {
        continue;
      }

      const type = this.toAdTypeCode(ad.type);
      const profession =
        ad.type === AdType.VACANCY
          ? ad.vacancyDetails?.position?.trim()
          : ad.resumeDetails?.profession?.trim() || ad.resumeDetails?.desiredPosition?.trim();

      if (!profession) {
        continue;
      }

      const key = `${type}:${profession.toLowerCase()}`;
      const current = counts.get(key);

      counts.set(key, {
        type,
        profession,
        ads: (current?.ads ?? 0) + 1
      });
    }

    return [...counts.values()].sort((left, right) => right.ads - left.ads).slice(0, 10);
  }

  private getRecommendations(totals: MetricTotals): Array<{ code: string; title: string; body: string }> {
    const recommendations: Array<{ code: string; title: string; body: string }> = [];
    const contactActions = totals.contactOpens + totals.phoneClicks + totals.emailClicks + totals.maxClicks + totals.websiteClicks;

    if (totals.views < 20) {
      recommendations.push({
        code: 'PROMOTE_LOW_VIEWS',
        title: 'Мало просмотров',
        body: 'Продвижение поможет поднять объявление выше в выдаче.'
      });
    }

    if (totals.views >= 20 && contactActions / Math.max(totals.views, 1) < 0.03) {
      recommendations.push({
        code: 'IMPROVE_LOW_CONTACTS',
        title: 'Просмотры есть, контактов мало',
        body: 'Проверьте заголовок, цену, фото и первые строки описания.'
      });
    }

    return recommendations;
  }

  private toPercent(numerator: number, denominator: number): number {
    if (denominator <= 0) {
      return 0;
    }

    return Math.round((numerator / denominator) * 1000) / 10;
  }

  private getVisitorHash(dto: AdAnalyticsEventDto, actor: AnalyticsActor, date: Date): string {
    const visitorKey = actor.userId ? `user:${actor.userId}` : `session:${dto.sessionId ?? actor.sessionId ?? 'anonymous'}`;
    return createHash('sha256')
      .update(`${dto.adId}:${this.formatDateKey(date)}:${visitorKey}`)
      .digest('hex');
  }

  private async assertActorCanRecord(actor: AnalyticsActor): Promise<void> {
    if (!actor.userId) {
      return;
    }

    const user = await this.db.user.findFirst({
      where: {
        id: actor.userId,
        status: UserStatus.ACTIVE,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!user) {
      throw new AppError('Analytics events are disabled for this user', 403, {
        code: 'ANALYTICS_USER_BLOCKED'
      });
    }
  }

  private buildPublicAdWhere(adId: string) {
    return {
      id: adId,
      status: {
        in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
      },
      deletedAt: null,
      hiddenAt: null,
      archivedAt: null,
      isTest: false,
      owner: {
        status: UserStatus.ACTIVE,
        deletedAt: null
      }
    };
  }

  private isInternalTraffic(userAgent?: string | null): boolean {
    const value = userAgent?.toLowerCase() ?? '';
    return value.includes('bot') || value.includes('crawler') || value.includes('spider') || value.includes('preview');
  }

  private getDayStart(date = new Date()): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private formatDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private toAdTypeCode(value: AdType): string {
    return value.toLowerCase();
  }
}
