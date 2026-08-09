import { logger } from '@rabst24/config';
import {
  AdStatus,
  AdType,
  SavedSearchFrequency,
  UserStatus,
  type PrismaClient,
  type SavedSearch
} from '@rabst24/db';
import {
  AppError,
  adListQuerySchema,
  canonicalizeAdListQuery,
  type AdListQueryDto,
  type AdTypeCode
} from '@rabst24/shared';
import type { AdRepository } from '@rabst24/core';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { OutboxService } from '../outbox/outbox.service.js';
import type {
  CreateSavedSearchDto,
  SavedSearchListQuery,
  SavedSearchResultsQuery,
  UpdateSavedSearchDto
} from './saved-searches.schemas.js';

export interface SavedSearchDto {
  id: string;
  name: string;
  adType: AdTypeCode;
  query: AdListQueryDto;
  canonicalFilters: AdListQueryDto;
  notificationFrequency: 'IMMEDIATE' | 'DAILY' | 'OFF';
  enabled: boolean;
  lastMatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class SavedSearchesService {
  constructor(
    private readonly db: PrismaClient,
    private readonly adRepository: AdRepository,
    private readonly outboxService: OutboxService,
    private readonly notificationService: NotificationService
  ) {}

  async create(userId: string, dto: CreateSavedSearchDto): Promise<SavedSearchDto> {
    const canonical = this.normalizeFilters(dto.adType, dto.query);
    const savedSearch = await this.db.savedSearch.create({
      data: {
        userId,
        name: dto.name,
        adType: this.mapAdType(dto.adType),
        query: JSON.stringify(canonical),
        canonicalFiltersJson: JSON.stringify(canonical),
        notificationFrequency: dto.notificationFrequency,
        enabled: dto.enabled
      }
    });

    return this.toDto(savedSearch);
  }

  async list(userId: string, query: SavedSearchListQuery): Promise<SavedSearchDto[]> {
    const items = await this.db.savedSearch.findMany({
      where: {
        userId,
        deletedAt: null,
        adType: query.adType ? this.mapAdType(query.adType) : undefined
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return items.map((item) => this.toDto(item));
  }

  async update(userId: string, savedSearchId: string, dto: UpdateSavedSearchDto): Promise<SavedSearchDto> {
    const existing = await this.findOwned(userId, savedSearchId);
    const canonical = dto.query ? this.normalizeFilters(this.toAdTypeCode(existing.adType), dto.query) : this.parseFilters(existing.canonicalFiltersJson);
    const updated = await this.db.savedSearch.update({
      where: {
        id: existing.id
      },
      data: {
        name: dto.name,
        query: dto.query ? JSON.stringify(canonical) : undefined,
        canonicalFiltersJson: dto.query ? JSON.stringify(canonical) : undefined,
        notificationFrequency: dto.notificationFrequency,
        enabled: dto.enabled
      }
    });

    return this.toDto(updated);
  }

  async delete(userId: string, savedSearchId: string): Promise<{ deleted: true }> {
    const existing = await this.findOwned(userId, savedSearchId);
    await this.db.savedSearch.update({
      where: {
        id: existing.id
      },
      data: {
        deletedAt: new Date(),
        enabled: false
      }
    });

    return {
      deleted: true
    };
  }

  async getResults(userId: string, savedSearchId: string, query: SavedSearchResultsQuery) {
    const existing = await this.findOwned(userId, savedSearchId);
    const filters = {
      ...this.parseFilters(existing.canonicalFiltersJson),
      page: query.page,
      perPage: query.perPage
    };

    return this.adRepository.listPublic(filters, this.toAdTypeCode(existing.adType));
  }

  async enqueueScanForAd(adId: string): Promise<void> {
    await this.outboxService.enqueue({
      type: 'SAVED_SEARCH_SCAN',
      payload: {
        adId
      },
      idempotencyKey: `saved-search-scan:ad:${adId}`,
      maxAttempts: 5
    });
  }

  async enqueueDailyDigest(date: Date | string = new Date()): Promise<void> {
    const digestDate = typeof date === 'string' ? date : this.formatDateKey(date);
    await this.outboxService.enqueue({
      type: 'SAVED_SEARCH_SCAN',
      payload: {
        dailyDigestDate: digestDate
      },
      idempotencyKey: `saved-search-digest:${digestDate}`,
      maxAttempts: 5
    });
  }

  async handleOutboxJob(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (typeof payload.adId === 'string' && payload.adId) {
      return this.matchPublishedAd(payload.adId);
    }

    if (typeof payload.dailyDigestDate === 'string' && payload.dailyDigestDate) {
      return this.sendDailyDigest(payload.dailyDigestDate);
    }

    if (typeof payload.savedSearchId === 'string' && payload.savedSearchId) {
      return this.rematchSavedSearch(payload.savedSearchId);
    }

    return {
      skipped: true,
      reason: 'empty_saved_search_scan_payload'
    };
  }

  async matchPublishedAd(adId: string): Promise<Record<string, unknown>> {
    const ad = await this.db.ad.findFirst({
      where: {
        id: adId,
        status: {
          in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
        },
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        isTest: false,
        owner: {
          is: {
            status: UserStatus.ACTIVE,
            deletedAt: null
          }
        }
      },
      select: {
        id: true,
        ownerId: true,
        type: true,
        title: true
      }
    });

    if (!ad) {
      return {
        matched: 0,
        skipped: true,
        reason: 'ad_not_public'
      };
    }

    const searches = await this.db.savedSearch.findMany({
      where: {
        adType: ad.type,
        enabled: true,
        deletedAt: null,
        notificationFrequency: {
          not: SavedSearchFrequency.OFF
        },
        userId: {
          not: ad.ownerId
        },
        user: {
          is: {
            status: UserStatus.ACTIVE,
            deletedAt: null
          }
        }
      },
      take: 500,
      orderBy: {
        createdAt: 'asc'
      }
    });

    let matched = 0;
    let notified = 0;

    for (const search of searches) {
      const query = this.parseFilters(search.canonicalFiltersJson);
      const isMatch = await this.adRepository.matchesPublicQuery(ad.id, query, this.toAdTypeCode(search.adType));

      if (!isMatch) {
        continue;
      }

      const created = await this.createMatch(search.id, ad.id);
      if (!created) {
        continue;
      }

      matched += 1;

      if (search.notificationFrequency === SavedSearchFrequency.IMMEDIATE) {
        await this.notifyImmediate(search, ad.id, ad.title);
        notified += 1;
      }
    }

    return {
      matched,
      notified
    };
  }

  async sendDailyDigest(digestDate: string): Promise<Record<string, unknown>> {
    const digestEnd = this.getDigestEnd(digestDate);
    const searches = await this.db.savedSearch.findMany({
      where: {
        enabled: true,
        deletedAt: null,
        notificationFrequency: SavedSearchFrequency.DAILY,
        matches: {
          some: {
            notifiedAt: null,
            createdAt: {
              lt: digestEnd
            }
          }
        },
        user: {
          is: {
            status: UserStatus.ACTIVE,
            deletedAt: null
          }
        }
      },
      include: {
        matches: {
          where: {
            notifiedAt: null,
            createdAt: {
              lt: digestEnd
            }
          },
          select: {
            adId: true
          }
        }
      },
      take: 500,
      orderBy: {
        updatedAt: 'asc'
      }
    });

    let digests = 0;
    let matchedAds = 0;
    const now = new Date();

    for (const search of searches) {
      if (search.matches.length === 0) {
        continue;
      }

      const count = search.matches.length;
      await this.notificationService.notify({
        userId: search.userId,
        type: 'SAVED_SEARCH_MATCHES',
        title: 'Новые объявления по сохранённому поиску',
        body: `${search.name}: найдено новых объявлений ${count}.`,
        category: 'saved_searches',
        idempotencyKey: `saved-search:${search.id}:digest:${digestDate}`,
        deepLink: {
          label: 'Открыть сохранённый поиск',
          path: `/saved-searches/${search.id}/results`,
          startParam: `saved_search_${search.id}`
        },
        payload: {
          savedSearchId: search.id,
          count,
          digestDate
        }
      });

      await this.db.savedSearchMatch.updateMany({
        where: {
          savedSearchId: search.id,
          notifiedAt: null,
          createdAt: {
            lt: digestEnd
          }
        },
        data: {
          notifiedAt: now
        }
      });
      await this.db.savedSearch.update({
        where: {
          id: search.id
        },
        data: {
          lastMatchedAt: now
        }
      });
      digests += 1;
      matchedAds += count;
    }

    return {
      digests,
      matchedAds
    };
  }

  private async rematchSavedSearch(savedSearchId: string): Promise<Record<string, unknown>> {
    const search = await this.db.savedSearch.findFirst({
      where: {
        id: savedSearchId,
        enabled: true,
        deletedAt: null
      }
    });

    if (!search) {
      return {
        skipped: true,
        reason: 'saved_search_not_found'
      };
    }

    const result = await this.adRepository.listPublic(
      {
        ...this.parseFilters(search.canonicalFiltersJson),
        page: 1,
        perPage: 50
      },
      this.toAdTypeCode(search.adType)
    );

    let matched = 0;
    for (const ad of result.items) {
      if (ad.ownerId === search.userId) {
        continue;
      }

      if (await this.createMatch(search.id, ad.id)) {
        matched += 1;
      }
    }

    return {
      matched
    };
  }

  private async createMatch(savedSearchId: string, adId: string): Promise<boolean> {
    try {
      await this.db.savedSearchMatch.create({
        data: {
          savedSearchId,
          adId
        }
      });
      return true;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return false;
      }

      throw error;
    }
  }

  private async notifyImmediate(search: SavedSearch, adId: string, adTitle: string): Promise<void> {
    const now = new Date();
    await this.notificationService.notify({
      userId: search.userId,
      type: 'SAVED_SEARCH_MATCHES',
      title: 'Новое объявление по сохранённому поиску',
      body: `${search.name}: «${adTitle}».`,
      category: 'saved_searches',
      idempotencyKey: `saved-search:${search.id}:ad:${adId}`,
      deepLink: this.notificationService.buildAdLink(adId, search.adType),
      payload: {
        savedSearchId: search.id,
        adId
      }
    });
    await this.db.savedSearchMatch.update({
      where: {
        savedSearchId_adId: {
          savedSearchId: search.id,
          adId
        }
      },
      data: {
        notifiedAt: now
      }
    });
    await this.db.savedSearch.update({
      where: {
        id: search.id
      },
      data: {
        lastMatchedAt: now
      }
    });
  }

  private async findOwned(userId: string, savedSearchId: string): Promise<SavedSearch> {
    const savedSearch = await this.db.savedSearch.findFirst({
      where: {
        id: savedSearchId,
        userId,
        deletedAt: null
      }
    });

    if (!savedSearch) {
      throw new AppError('Saved search not found', 404, {
        code: 'SAVED_SEARCH_NOT_FOUND'
      });
    }

    return savedSearch;
  }

  private normalizeFilters(adType: AdTypeCode, query: Partial<AdListQueryDto>): AdListQueryDto {
    return this.sanitizeSavedSearchFilters(canonicalizeAdListQuery(
      {
        ...query,
        page: 1,
        perPage: 20
      },
      adType
    ));
  }

  private parseFilters(value: string): AdListQueryDto {
    try {
      return this.sanitizeSavedSearchFilters(adListQuerySchema.parse(JSON.parse(value) as unknown));
    } catch (error) {
      logger.warn({ err: error }, 'Failed to parse saved search filters');
      return this.sanitizeSavedSearchFilters(adListQuerySchema.parse({
        page: 1,
        perPage: 20
      }));
    }
  }

  private sanitizeSavedSearchFilters(filters: AdListQueryDto): AdListQueryDto {
    return Object.fromEntries(
      Object.entries({
        type: filters.type,
        q: filters.q,
        city: filters.city,
        district: filters.district,
        category: filters.category,
        priceFrom: filters.priceFrom,
        priceTo: filters.priceTo,
        page: filters.page,
        perPage: filters.perPage
      }).filter(([, value]) => value !== undefined && value !== '')
    ) as AdListQueryDto;
  }

  private toDto(search: SavedSearch): SavedSearchDto {
    return {
      id: search.id,
      name: search.name,
      adType: this.toAdTypeCode(search.adType),
      query: this.parseFilters(search.query),
      canonicalFilters: this.parseFilters(search.canonicalFiltersJson),
      notificationFrequency: search.notificationFrequency,
      enabled: search.enabled,
      lastMatchedAt: search.lastMatchedAt?.toISOString() ?? null,
      createdAt: search.createdAt.toISOString(),
      updatedAt: search.updatedAt.toISOString()
    };
  }

  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDigestEnd(digestDate: string): Date {
    const [year, month, day] = digestDate.split('-').map((part) => Number(part));
    return new Date(year, month - 1, day + 1);
  }

  private mapAdType(value: AdTypeCode): AdType {
    const map: Record<AdTypeCode, AdType> = {
      vacancy: AdType.VACANCY,
      resume: AdType.RESUME,
      equipment: AdType.EQUIPMENT,
      material: AdType.MATERIAL,
      tool: AdType.TOOL
    };

    return map[value];
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

  private isUniqueConstraintError(error: unknown): boolean {
    const candidate = error as { code?: string } | null;
    return candidate?.code === 'P2002';
  }
}
