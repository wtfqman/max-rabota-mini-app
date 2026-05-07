import { AdStatus, AdType, Prisma, type PrismaClient } from '@rabst24/db';
import type { AdListQueryDto, AdTypeCode } from '@rabst24/shared';
import {
  buildTaxonomySearchVariants,
  canonicalizeCategory,
  canonicalizeDistrict,
  normalizeSearchText
} from '@rabst24/shared';

export const adWithDetailsInclude = Prisma.validator<Prisma.AdInclude>()({
  owner: {
    select: {
      id: true,
      maxUserId: true,
      maxUsername: true,
      firstName: true,
      lastName: true,
      displayName: true
    }
  },
  vacancyDetails: {
    include: {
      metroStations: {
        include: {
          metroStation: true
        },
        orderBy: {
          sortOrder: 'asc'
        }
      }
    }
  },
  resumeDetails: true,
  equipmentDetails: true,
  photos: {
    where: {
      deletedAt: null
    },
    orderBy: {
      sortOrder: 'asc'
    }
  },
  contacts: {
    where: {
      deletedAt: null,
      isPublic: true
    },
    orderBy: [
      {
        isPreferred: 'desc'
      },
      {
        sortOrder: 'asc'
      }
    ]
  },
  requirements: {
    orderBy: {
      sortOrder: 'asc'
    }
  },
  responsibilities: {
    orderBy: {
      sortOrder: 'asc'
    }
  },
  benefits: {
    orderBy: {
      sortOrder: 'asc'
    }
  },
  moderationLogs: {
    orderBy: {
      createdAt: 'desc'
    },
    take: 5
  }
});

export type PublicAdRecord = Prisma.AdGetPayload<{
  include: typeof adWithDetailsInclude;
}>;

export type AdWithDetailsRecord = PublicAdRecord;

export interface PublicAdListResult {
  items: PublicAdRecord[];
  total: number;
  page: number;
  perPage: number;
}

export interface OwnedAdListQuery {
  type?: AdTypeCode;
  status?: string;
  q?: string;
  page: number;
  perPage: number;
}

export interface ModerationQueueQuery {
  status?: string;
  type?: AdTypeCode;
  q?: string;
  page: number;
  perPage: number;
}

export class AdRepository {
  constructor(private readonly db: PrismaClient) {}

  async createPending(data: Prisma.AdCreateInput) {
    return this.db.ad.create({
      data: {
        ...data,
        status: AdStatus.PENDING_MODERATION
      }
    });
  }

  async findById(adId: string) {
    return this.db.ad.findUnique({
      where: {
        id: adId
      }
    });
  }

  async listPublic(
    query: AdListQueryDto,
    forcedType?: AdTypeCode
  ): Promise<PublicAdListResult> {
    const where = this.buildPublicWhere(query, forcedType);
    const page = query.page;
    const perPage = query.perPage;

    const [items, total] = await this.db.$transaction([
      this.db.ad.findMany({
        where,
        include: adWithDetailsInclude,
        orderBy: [
          {
            publishedAt: 'desc'
          },
          {
            createdAt: 'desc'
          }
        ],
        skip: (page - 1) * perPage,
        take: perPage
      }),
      this.db.ad.count({
        where
      })
    ]);

    return {
      items,
      total,
      page,
      perPage
    };
  }

  async findPublicById(adId: string, forcedType?: AdTypeCode): Promise<PublicAdRecord | null> {
    return this.db.ad.findFirst({
      where: {
        ...this.buildPublicBaseWhere(forcedType),
        id: adId
      },
      include: adWithDetailsInclude
    });
  }

  async findWithDetailsById(adId: string): Promise<AdWithDetailsRecord | null> {
    return this.db.ad.findFirst({
      where: {
        id: adId,
        deletedAt: null
      },
      include: adWithDetailsInclude
    });
  }

  async listForModeration(query: ModerationQueueQuery): Promise<PublicAdListResult> {
    const where = this.buildModerationWhere(query);
    const page = query.page;
    const perPage = query.perPage;

    const [items, total] = await this.db.$transaction([
      this.db.ad.findMany({
        where,
        include: adWithDetailsInclude,
        orderBy: [
          {
            updatedAt: 'desc'
          },
          {
            createdAt: 'desc'
          }
        ],
        skip: (page - 1) * perPage,
        take: perPage
      }),
      this.db.ad.count({ where })
    ]);

    return {
      items,
      total,
      page,
      perPage
    };
  }

  async listOwned(ownerId: string, query: OwnedAdListQuery): Promise<PublicAdListResult> {
    const where = this.buildOwnedWhere(ownerId, query);
    const page = query.page;
    const perPage = query.perPage;

    const [items, total] = await this.db.$transaction([
      this.db.ad.findMany({
        where,
        include: adWithDetailsInclude,
        orderBy: [
          {
            updatedAt: 'desc'
          },
          {
            createdAt: 'desc'
          }
        ],
        skip: (page - 1) * perPage,
        take: perPage
      }),
      this.db.ad.count({ where })
    ]);

    return {
      items,
      total,
      page,
      perPage
    };
  }

  async updateOwned(
    ownerId: string,
    adId: string,
    data: {
      title?: string;
      description?: string | null;
      city?: string | null;
      districtText?: string | null;
      categoryText?: string | null;
    }
  ): Promise<AdWithDetailsRecord | null> {
    const existing = await this.db.ad.findFirst({
      where: {
        id: adId,
        ownerId,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!existing) {
      return null;
    }

    return this.db.ad.update({
      where: {
        id: adId
      },
      data: {
        title: data.title,
        description: data.description,
        city: data.city,
        districtText: canonicalizeDistrict(data.districtText),
        categoryText: canonicalizeCategory(data.categoryText)
      },
      include: adWithDetailsInclude
    });
  }

  async updateOwnedStatus(
    ownerId: string,
    adId: string,
    status: AdStatus
  ): Promise<AdWithDetailsRecord | null> {
    const existing = await this.db.ad.findFirst({
      where: {
        id: adId,
        ownerId,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!existing) {
      return null;
    }

    return this.db.ad.update({
      where: {
        id: adId
      },
      data: this.buildStatusUpdateData(status),
      include: adWithDetailsInclude
    });
  }

  async updateStatus(adId: string, status: AdStatus) {
    return this.db.ad.update({
      where: {
        id: adId
      },
      data: this.buildStatusUpdateData(status)
    });
  }

  private buildPublicWhere(query: AdListQueryDto, forcedType?: AdTypeCode): Prisma.AdWhereInput {
    const filters: Prisma.AdWhereInput[] = [];

    if (query.q) {
      filters.push(this.buildTextSearchWhere(query.q));
    }

    if (query.city) {
      filters.push({
        city: this.contains(query.city)
      });
    }

    const districtVariants = buildTaxonomySearchVariants(query.district, 'district');
    if (districtVariants.length) {
      filters.push(this.buildFieldVariantWhere('districtText', districtVariants));
    }

    const categoryVariants = buildTaxonomySearchVariants(query.category, 'category');
    if (categoryVariants.length) {
      filters.push({
        OR: [
          this.buildFieldVariantWhere('categoryText', categoryVariants),
          ...categoryVariants.map((variant) => ({
            equipmentDetails: {
              is: {
                categoryText: this.contains(variant)
              }
            }
          }))
        ]
      });
    }

    if (query.schedule || query.experience) {
      filters.push({
        vacancyDetails: {
          is: {
            schedule: query.schedule ? this.contains(query.schedule) : undefined,
            experience: query.experience ? this.contains(query.experience) : undefined
          }
        }
      });
    }

    return {
      ...this.buildPublicBaseWhere(forcedType ?? query.type),
      AND: filters.length > 0 ? filters : undefined
    };
  }

  private buildPublicBaseWhere(type?: AdTypeCode): Prisma.AdWhereInput {
    return {
      status: {
        in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
      },
      deletedAt: null,
      hiddenAt: null,
      archivedAt: null,
      type: type ? this.mapAdType(type) : undefined
    };
  }

  private buildModerationWhere(query: ModerationQueueQuery): Prisma.AdWhereInput {
    const filters: Prisma.AdWhereInput[] = [];

    if (query.q) {
      filters.push(this.buildTextSearchWhere(query.q));
    }

    return {
      status: this.mapStatus(query.status) ?? AdStatus.PENDING_MODERATION,
      deletedAt: null,
      type: query.type ? this.mapAdType(query.type) : undefined,
      AND: filters.length > 0 ? filters : undefined
    };
  }

  private buildOwnedWhere(ownerId: string, query: OwnedAdListQuery): Prisma.AdWhereInput {
    const filters: Prisma.AdWhereInput[] = [];

    if (query.q) {
      filters.push(this.buildTextSearchWhere(query.q));
    }

    return {
      ownerId,
      deletedAt: null,
      type: query.type ? this.mapAdType(query.type) : undefined,
      status: this.mapStatus(query.status),
      AND: filters.length > 0 ? filters : undefined
    };
  }

  private buildTextSearchWhere(query: string): Prisma.AdWhereInput {
    const normalizedQuery = normalizeSearchText(query) ?? query;
    const textFilter = this.contains(normalizedQuery);

    return {
      OR: [
        {
          title: textFilter
        },
        {
          description: textFilter
        },
        {
          city: textFilter
        },
        {
          districtText: textFilter
        },
        {
          categoryText: textFilter
        },
        {
          vacancyDetails: {
            is: {
              OR: [
                {
                  companyName: textFilter
                },
                {
                  position: textFilter
                },
                {
                  schedule: textFilter
                },
                {
                  experience: textFilter
                }
              ]
            }
          }
        },
        {
          resumeDetails: {
            is: {
              OR: [
                {
                  desiredPosition: textFilter
                },
                {
                  education: textFilter
                },
                {
                  availability: textFilter
                }
              ]
            }
          }
        },
        {
          equipmentDetails: {
            is: {
              OR: [
                {
                  categoryText: textFilter
                },
                {
                  brand: textFilter
                },
                {
                  model: textFilter
                }
              ]
            }
          }
        }
      ]
    };
  }

  private contains(value: string) {
    return {
      contains: value,
      mode: 'insensitive' as const
    };
  }

  private buildFieldVariantWhere(field: 'districtText' | 'categoryText', variants: string[]): Prisma.AdWhereInput {
    return {
      OR: variants.map((variant) => ({
        [field]: this.contains(variant)
      }))
    };
  }

  private mapAdType(type: AdListQueryDto['type']): AdType | undefined {
    if (type === 'vacancy') {
      return AdType.VACANCY;
    }

    if (type === 'resume') {
      return AdType.RESUME;
    }

    if (type === 'equipment') {
      return AdType.EQUIPMENT;
    }

    return undefined;
  }

  private mapStatus(status: string | undefined): AdStatus | undefined {
    if (!status) {
      return undefined;
    }

    const normalized = status.toLowerCase();

    if (normalized === 'draft') {
      return AdStatus.DRAFT;
    }

    if (normalized === 'pending_moderation') {
      return AdStatus.PENDING_MODERATION;
    }

    if (normalized === 'approved') {
      return AdStatus.APPROVED;
    }

    if (normalized === 'rejected') {
      return AdStatus.REJECTED;
    }

    if (normalized === 'published') {
      return AdStatus.PUBLISHED;
    }

    if (normalized === 'hidden') {
      return AdStatus.HIDDEN;
    }

    if (normalized === 'archived') {
      return AdStatus.ARCHIVED;
    }

    return undefined;
  }

  private buildStatusUpdateData(status: AdStatus): Prisma.AdUpdateInput {
    return {
      status,
      moderatedAt:
        status === AdStatus.APPROVED || status === AdStatus.REJECTED ? new Date() : undefined,
      publishedAt: status === AdStatus.PUBLISHED ? new Date() : undefined,
      hiddenAt: status === AdStatus.HIDDEN ? new Date() : undefined,
      archivedAt: status === AdStatus.ARCHIVED ? new Date() : undefined
    };
  }
}
