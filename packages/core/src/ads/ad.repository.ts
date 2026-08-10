import {
  AdStatus,
  AdType,
  EquipmentCondition,
  EmploymentType,
  ListingDealType,
  PaymentStatus,
  Prisma,
  ProductCondition,
  UserStatus,
  WorkFormat,
  type PrismaClient
} from '@rabst24/db';
import type { AdListQueryDto, AdTypeCode } from '@rabst24/shared';
import {
  buildTaxonomySearchVariants,
  canonicalizeAdListQuery,
  canonicalizeCategory,
  canonicalizeDistrict,
  normalizeSearchText
} from '@rabst24/shared';
import { getAdPublicationSettings, mergeAdPublicationSettings } from './ad-publication-settings.js';

export const PUBLIC_AD_MAX_AGE_DAYS = 7;

export function buildPublicAdFreshnessFilters(now = new Date()): Prisma.AdWhereInput[] {
  const freshSince = new Date(now.getTime() - PUBLIC_AD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  return [
    {
      OR: [
        {
          expiresAt: null
        },
        {
          expiresAt: {
            gt: now
          }
        }
      ]
    },
    {
      OR: [
        {
          publishedAt: {
            gte: freshSince
          }
        },
        {
          publishedAt: null,
          createdAt: {
            gte: freshSince
          }
        }
      ]
    }
  ];
}

export const adWithDetailsInclude = Prisma.validator<Prisma.AdInclude>()({
  owner: {
    select: {
      id: true,
      maxUserId: true,
      maxUsername: true,
      firstName: true,
      lastName: true,
      displayName: true,
      status: true,
      deletedAt: true,
      profile: {
        select: {
          avatarUrl: true,
          profileType: true,
          companyName: true,
          allowResumePublicProfile: true
        }
      },
      trustBadgeAssignments: {
        select: {
          badge: true
        }
      }
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
  productDetails: true,
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
  },
  payments: {
    orderBy: {
      createdAt: 'desc'
    },
    take: 1
  }
});

const adDuplicateCandidateSelect = Prisma.validator<Prisma.AdSelect>()({
  id: true,
  type: true,
  status: true,
  title: true,
  description: true,
  city: true,
  districtText: true,
  categoryText: true,
  priceAmount: true,
  metadataJson: true,
  createdAt: true,
  deletedAt: true,
  vacancyDetails: {
    select: {
      companyName: true,
      position: true,
      salaryFrom: true,
      salaryTo: true,
      salaryPeriod: true,
      schedule: true,
      experience: true
    }
  },
  resumeDetails: {
    select: {
      desiredPosition: true,
      expectedSalary: true
    }
  },
  equipmentDetails: {
    select: {
      categoryText: true,
      brand: true,
      model: true
    }
  },
  requirements: {
    select: {
      text: true
    },
    orderBy: {
      sortOrder: 'asc'
    }
  },
  responsibilities: {
    select: {
      text: true
    },
    orderBy: {
      sortOrder: 'asc'
    }
  },
  benefits: {
    select: {
      text: true
    },
    orderBy: {
      sortOrder: 'asc'
    }
  }
});

export type PublicAdRecord = Prisma.AdGetPayload<{
  include: typeof adWithDetailsInclude;
}>;

export type AdWithDetailsRecord = PublicAdRecord;

export type DuplicateCandidateRecord = Prisma.AdGetPayload<{
  select: typeof adDuplicateCandidateSelect;
}>;

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

  async createPending(data: Prisma.AdCreateInput, status: AdStatus = AdStatus.PENDING_MODERATION) {
    return this.db.ad.create({
      data: {
        ...data,
        status
      }
    });
  }

  async listRecentDuplicateCandidates(
    ownerId: string,
    type: AdType,
    createdSince: Date
  ): Promise<DuplicateCandidateRecord[]> {
    return this.db.ad.findMany({
      where: {
        ownerId,
        type,
        deletedAt: null,
        status: {
          not: AdStatus.DRAFT
        },
        createdAt: {
          gte: createdSince
        }
      },
      select: adDuplicateCandidateSelect,
      orderBy: {
        createdAt: 'desc'
      },
      take: 60
    });
  }

  async updatePhotoMaxMediaToken(
    photoId: string,
    data: {
      token: string;
      mediaType: string;
      strategy: string;
      payload?: Prisma.InputJsonValue;
    }
  ) {
    return this.db.adPhoto.update({
      where: {
        id: photoId
      },
      data: {
        maxMediaToken: data.token,
        maxMediaType: data.mediaType,
        maxMediaStrategy: data.strategy,
        maxMediaPayloadJson: data.payload ? JSON.stringify(data.payload) : undefined,
        maxMediaUploadedAt: new Date()
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
    await this.expirePromotionSortFields();
    const where = this.buildPublicWhere(query, forcedType);
    const page = query.page;
    const perPage = query.perPage;

    const [items, total] = await this.db.$transaction([
      this.db.ad.findMany({
        where,
        include: adWithDetailsInclude,
        orderBy: [
          {
            promotionPinnedUntil: 'desc'
          },
          {
            promotionRecommendedUntil: 'desc'
          },
          {
            promotionUrgentUntil: 'desc'
          },
          {
            boostedAt: 'desc'
          },
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

  async matchesPublicQuery(adId: string, query: AdListQueryDto, forcedType?: AdTypeCode): Promise<boolean> {
    const count = await this.db.ad.count({
      where: {
        ...this.buildPublicWhere(query, forcedType),
        id: adId
      }
    });

    return count > 0;
  }

  async findWithDetailsById(adId: string): Promise<AdWithDetailsRecord | null> {
    return this.db.ad.findFirst({
      where: {
        id: adId
      },
      include: adWithDetailsInclude
    });
  }

  async findOwnedWithDetailsById(ownerId: string, adId: string): Promise<AdWithDetailsRecord | null> {
    return this.db.ad.findFirst({
      where: {
        id: adId,
        ownerId,
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
      desiredPosition?: string | null;
    },
    options: { statusAfterPublicEdit?: AdStatus } = {}
  ): Promise<AdWithDetailsRecord | null> {
    const existing = await this.db.ad.findFirst({
      where: {
        id: adId,
        ownerId,
        deletedAt: null
      },
      select: {
        id: true,
        type: true,
        status: true,
        metadataJson: true
      }
    });

    if (!existing) {
      return null;
    }

    const statusAfterPublicEdit = options.statusAfterPublicEdit ?? AdStatus.PENDING_MODERATION;
    const statusUpdateData = this.requiresModerationAfterOwnerEdit(existing.status)
      ? this.buildStatusUpdateData(statusAfterPublicEdit, existing.metadataJson)
      : {};

    return this.db.ad.update({
      where: {
        id: adId
      },
      data: {
        ...statusUpdateData,
        title: data.title,
        description: data.description,
        city: data.city,
        districtText: canonicalizeDistrict(data.districtText),
        categoryText: canonicalizeCategory(data.categoryText),
        resumeDetails:
          existing.type === AdType.RESUME && data.desiredPosition !== undefined
            ? {
                upsert: {
                  create: {
                    desiredPosition: data.desiredPosition
                  },
                  update: {
                    desiredPosition: data.desiredPosition
                  }
                }
              }
            : undefined
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
        id: true,
        metadataJson: true
      }
    });

    if (!existing) {
      return null;
    }

    return this.db.ad.update({
      where: {
        id: adId
      },
      data: this.buildStatusUpdateData(status, existing.metadataJson),
      include: adWithDetailsInclude
    });
  }

  async updateStatus(adId: string, status: AdStatus) {
    const existing = await this.db.ad.findUnique({
      where: {
        id: adId
      },
      select: {
        metadataJson: true
      }
    });

    return this.db.ad.update({
      where: {
        id: adId
      },
      data: this.buildStatusUpdateData(status, existing?.metadataJson)
    });
  }

  async markPublishedIfPublishable(adId: string): Promise<AdWithDetailsRecord | null> {
    const updated = await this.db.ad.updateMany({
      where: {
        id: adId,
        status: {
          in: [AdStatus.APPROVED, AdStatus.PUBLISHED]
        },
        deletedAt: null,
        hiddenAt: null,
        archivedAt: null,
        AND: [this.buildVacancyFinanciallyEligibleWhere()]
      },
      data: this.buildStatusUpdateData(AdStatus.PUBLISHED)
    });

    if (updated.count === 0) {
      return null;
    }

    return this.findWithDetailsById(adId);
  }

  async updateOwnedMetadataJson(ownerId: string, adId: string, metadataJson: string): Promise<AdWithDetailsRecord | null> {
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
        metadataJson
      },
      include: adWithDetailsInclude
    });
  }

  async updateMetadataJson(adId: string, metadataJson: string): Promise<AdWithDetailsRecord | null> {
    const existing = await this.db.ad.findFirst({
      where: {
        id: adId,
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
        metadataJson
      },
      include: adWithDetailsInclude
    });
  }

  async softDelete(adId: string): Promise<AdWithDetailsRecord | null> {
    const existing = await this.db.ad.findFirst({
      where: {
        id: adId
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
      data: this.buildStatusUpdateData(AdStatus.DELETED),
      include: adWithDetailsInclude
    });
  }

  private buildPublicWhere(query: AdListQueryDto, forcedType?: AdTypeCode): Prisma.AdWhereInput {
    const canonicalQuery = canonicalizeAdListQuery(query, forcedType ?? query.type);
    const filters: Prisma.AdWhereInput[] = [];

    if (canonicalQuery.q) {
      filters.push(this.buildTextSearchWhere(canonicalQuery.q));
    }

    if (canonicalQuery.city) {
      filters.push(this.buildLocationVariantWhere([canonicalQuery.city]));
    }

    const districtVariants = buildTaxonomySearchVariants(canonicalQuery.district, 'district');
    if (districtVariants.length) {
      filters.push(this.buildLocationVariantWhere(districtVariants));
    }

    const categoryVariants = buildTaxonomySearchVariants(canonicalQuery.category, 'category');
    if (categoryVariants.length) {
      filters.push(this.buildCategoryVariantWhere(categoryVariants));
    }

    if (canonicalQuery.schedule || canonicalQuery.experience) {
      filters.push({
        vacancyDetails: {
          is: {
            schedule: canonicalQuery.schedule ? this.contains(canonicalQuery.schedule) : undefined,
            experience: canonicalQuery.experience ? this.contains(canonicalQuery.experience) : undefined
          }
        }
      });
    }

    if (canonicalQuery.employmentType || canonicalQuery.workFormat) {
      filters.push({
        OR: [
          {
            vacancyDetails: {
              is: {
                employmentType: this.normalizeEmploymentType(canonicalQuery.employmentType),
                workFormat: this.normalizeWorkFormat(canonicalQuery.workFormat)
              }
            }
          },
          {
            resumeDetails: {
              is: {
                employmentType: this.normalizeEmploymentType(canonicalQuery.employmentType),
                workFormat: this.normalizeWorkFormat(canonicalQuery.workFormat)
              }
            }
          }
        ]
      });
    }

    if (canonicalQuery.availability) {
      filters.push({
        resumeDetails: {
          is: {
            availability: this.contains(canonicalQuery.availability)
          }
        }
      });
    }

    if (canonicalQuery.dealType || canonicalQuery.brand) {
      filters.push({
        equipmentDetails: {
          is: {
            dealType: this.normalizeListingDealType(canonicalQuery.dealType),
            brand: canonicalQuery.brand ? this.contains(canonicalQuery.brand) : undefined
          }
        }
      });
    }

    if (canonicalQuery.condition) {
      filters.push({
        OR: [
          {
            equipmentDetails: {
              is: {
                condition: this.normalizeEquipmentCondition(canonicalQuery.condition)
              }
            }
          },
          {
            productDetails: {
              is: {
                condition: this.normalizeProductCondition(canonicalQuery.condition)
              }
            }
          }
        ]
      });
    }

    const priceRangeWhere = this.buildPriceRangeWhere(canonicalQuery.priceFrom, canonicalQuery.priceTo);
    if (priceRangeWhere) {
      filters.push(priceRangeWhere);
    }

    filters.push(this.buildVacancyFinanciallyEligibleWhere());

    const baseWhere = this.buildPublicBaseWhere(forcedType ?? canonicalQuery.type);
    const baseFilters = Array.isArray(baseWhere.AND) ? baseWhere.AND : baseWhere.AND ? [baseWhere.AND] : [];
    const allFilters = [...baseFilters, ...filters];

    return {
      ...baseWhere,
      AND: allFilters.length > 0 ? allFilters : undefined
    };
  }

  private async expirePromotionSortFields(now = new Date()): Promise<void> {
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
          promotionRecommendedUntil: {
            lt: now
          }
        },
        data: {
          promotionRecommendedUntil: null
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
      })
    ]);
  }

  private buildPublicBaseWhere(type?: AdTypeCode): Prisma.AdWhereInput {
    const now = new Date();

    return {
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
      },
      type: type ? this.mapAdType(type) : undefined,
      AND: buildPublicAdFreshnessFilters(now)
    };
  }

  private buildModerationWhere(query: ModerationQueueQuery): Prisma.AdWhereInput {
    const filters: Prisma.AdWhereInput[] = [];

    if (query.q) {
      filters.push(this.buildTextSearchWhere(query.q));
    }

    if (query.status === 'test') {
      return {
        deletedAt: null,
        type: query.type ? this.mapAdType(query.type) : undefined,
        OR: [
          {
            isTest: true
          },
          ...this.buildTestAdWhere()
        ],
        AND: filters.length > 0 ? filters : undefined
      };
    }

    const status = this.mapStatus(query.status) ?? AdStatus.PENDING_MODERATION;

    const moderationFilters = [...filters];

    if (status === AdStatus.PENDING_MODERATION) {
      moderationFilters.push(this.buildVacancyFinanciallyEligibleWhere());
    }

    if (status === AdStatus.PENDING_MODERATION) {
      return {
        deletedAt: null,
        type: query.type ? this.mapAdType(query.type) : undefined,
        OR: [
          {
            status,
            AND: moderationFilters.length > 0 ? moderationFilters : undefined
          },
          {
            status: {
              in: [AdStatus.REJECTED, AdStatus.APPROVED, AdStatus.PUBLISHED, AdStatus.HIDDEN, AdStatus.ARCHIVED]
            },
            metadataJson: {
              contains: '"activeRevisionStatus":"PENDING_MODERATION"'
            },
            AND: moderationFilters.length > 0 ? moderationFilters : undefined
          }
        ]
      };
    }

    return {
      status,
      deletedAt: status === AdStatus.DELETED ? { not: null } : null,
      type: query.type ? this.mapAdType(query.type) : undefined,
      AND: moderationFilters.length > 0 ? moderationFilters : undefined
    };
  }

  private buildVacancyFinanciallyEligibleWhere(): Prisma.AdWhereInput {
    return {
      OR: [
        {
          type: {
            not: AdType.VACANCY
          }
        },
        {
          vacancyPublicationUsages: {
            some: {
              returnedAt: null
            }
          }
        },
        {
          payments: {
            some: {
              status: PaymentStatus.SUCCEEDED,
              refundedAt: null
            }
          }
        }
      ]
    };
  }

  private buildOwnedWhere(ownerId: string, query: OwnedAdListQuery): Prisma.AdWhereInput {
    const filters: Prisma.AdWhereInput[] = [];

    if (query.q) {
      filters.push(this.buildTextSearchWhere(query.q));
    }

    const status = this.mapStatus(query.status);

    return {
      ownerId,
      deletedAt: status === AdStatus.DELETED ? { not: null } : null,
      type: query.type ? this.mapAdType(query.type) : undefined,
      status,
      AND: filters.length > 0 ? filters : undefined
    };
  }

  private buildTextSearchWhere(query: string): Prisma.AdWhereInput {
    const variants = this.buildSearchVariants(query);

    return {
      OR: variants.flatMap((variant) => this.buildTextSearchVariantWhere(variant))
    };
  }

  private buildTextSearchVariantWhere(query: string): Prisma.AdWhereInput[] {
    const textFilter = this.contains(query);

    return [
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
              },
              {
                paymentFormat: textFilter
              },
              {
                projectDuration: textFilter
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
                profession: textFilter
              },
              {
                specialization: textFilter
              },
              {
                experienceText: textFilter
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
      },
      {
        productDetails: {
          is: {
            OR: [
              {
                manufacturer: textFilter
              },
              {
                model: textFilter
              },
              {
                unit: textFilter
              }
            ]
          }
        }
      }
    ];
  }

  private buildSearchVariants(value: string): string[] {
    const variants = new Set<string>();
    const raw = value.trim();
    const normalized = normalizeSearchText(value);
    const taxonomyVariants = [
      ...buildTaxonomySearchVariants(value, 'category'),
      ...buildTaxonomySearchVariants(value, 'district')
    ];

    for (const variant of [raw, normalized, ...taxonomyVariants]) {
      this.addCaseVariants(variants, variant);
    }

    return [...variants];
  }

  private expandSearchVariants(values: string[]): string[] {
    const variants = new Set<string>();

    values.forEach((value) => {
      this.buildSearchVariants(value).forEach((variant) => variants.add(variant));
    });

    return [...variants];
  }

  private addCaseVariants(variants: Set<string>, value: string | null | undefined): void {
    const trimmed = value?.trim();

    if (!trimmed) {
      return;
    }

    variants.add(trimmed);

    const lower = trimmed.toLocaleLowerCase('ru-RU');
    const upper = trimmed.toLocaleUpperCase('ru-RU');

    variants.add(lower);
    variants.add(upper);
    variants.add(this.toTitleCase(lower));
  }

  private toTitleCase(value: string): string {
    return value.replace(/(^|[\s/-])(\p{L})/gu, (_match, prefix: string, letter: string) =>
      `${prefix}${letter.toLocaleUpperCase('ru-RU')}`
    );
  }

  private buildTestAdWhere(): Prisma.AdWhereInput[] {
    const variants = ['test', 'тест', 'тестовое', 'тестовая', 'проверка'];

    return variants.flatMap((variant) => [
      {
        title: this.contains(variant)
      },
      {
        description: this.contains(variant)
      },
      {
        categoryText: this.contains(variant)
      }
    ]);
  }

  private buildPriceRangeWhere(priceFrom?: number, priceTo?: number): Prisma.AdWhereInput | null {
    const min = typeof priceFrom === 'number' && Number.isFinite(priceFrom) ? priceFrom : undefined;
    const max = typeof priceTo === 'number' && Number.isFinite(priceTo) ? priceTo : undefined;

    if (min === undefined && max === undefined) {
      return null;
    }

    const range = this.buildNumberRangeFilter(min, max);

    return {
      OR: [
        {
          priceAmount: range
        },
        {
          resumeDetails: {
            is: {
              expectedSalary: range
            }
          }
        },
        {
          equipmentDetails: {
            is: {
              OR: [
                {
                  rentalPrice: range
                },
                {
                  salePrice: range
                }
              ]
            }
          }
        },
        {
          vacancyDetails: {
            is: this.buildVacancySalaryRangeWhere(min, max)
          }
        }
      ]
    };
  }

  private buildNumberRangeFilter(min?: number, max?: number) {
    return {
      gte: min,
      lte: max
    };
  }

  private buildVacancySalaryRangeWhere(min?: number, max?: number): Prisma.VacancyDetailsWhereInput {
    const filters: Prisma.VacancyDetailsWhereInput[] = [];

    if (min !== undefined) {
      filters.push({
        OR: [
          {
            salaryFrom: {
              gte: min
            }
          },
          {
            salaryTo: {
              gte: min
            }
          }
        ]
      });
    }

    if (max !== undefined) {
      filters.push({
        OR: [
          {
            salaryFrom: {
              lte: max
            }
          },
          {
            salaryTo: {
              lte: max
            }
          }
        ]
      });
    }

    return filters.length > 0 ? { AND: filters } : {};
  }

  private contains(value: string) {
    return {
      contains: value
    };
  }

  private normalizeEnumFilter(value: string): string {
    return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  }

  private normalizeEmploymentType(value?: string): EmploymentType | undefined {
    return this.pickEnumValue(EmploymentType, value);
  }

  private normalizeWorkFormat(value?: string): WorkFormat | undefined {
    return this.pickEnumValue(WorkFormat, value);
  }

  private normalizeListingDealType(value?: string): ListingDealType | undefined {
    return this.pickEnumValue(ListingDealType, value);
  }

  private normalizeEquipmentCondition(value?: string): EquipmentCondition | undefined {
    return this.pickEnumValue(EquipmentCondition, value);
  }

  private normalizeProductCondition(value?: string): ProductCondition | undefined {
    return this.pickEnumValue(ProductCondition, value);
  }

  private pickEnumValue<TValue extends string>(values: Record<string, TValue>, value?: string): TValue | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = this.normalizeEnumFilter(value);
    return Object.values(values).find((item) => item === normalized);
  }

  private buildLocationVariantWhere(variants: string[]): Prisma.AdWhereInput {
    const searchVariants = this.expandSearchVariants(variants);

    return {
      OR: searchVariants.flatMap((variant) => [
        {
          city: this.contains(variant)
        },
        {
          districtText: this.contains(variant)
        },
        {
          metadataJson: this.contains(variant)
        }
      ])
    };
  }

  private buildCategoryVariantWhere(variants: string[]): Prisma.AdWhereInput {
    const searchVariants = this.expandSearchVariants(variants);

    return {
      OR: searchVariants.flatMap((variant) => [
        {
          categoryText: this.contains(variant)
        },
        {
          title: this.contains(variant)
        },
        {
          equipmentDetails: {
            is: {
              OR: [
                {
                  categoryText: this.contains(variant)
                },
                {
                  brand: this.contains(variant)
                },
                {
                  model: this.contains(variant)
                }
              ]
            }
          }
        },
        {
          vacancyDetails: {
            is: {
              position: this.contains(variant)
            }
          }
        },
        {
          resumeDetails: {
            is: {
              desiredPosition: this.contains(variant)
            }
          }
        }
      ])
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

    if (type === 'material') {
      return AdType.MATERIAL;
    }

    if (type === 'tool') {
      return AdType.TOOL;
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

    if (normalized === 'payment_pending') {
      return AdStatus.PAYMENT_PENDING;
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

    if (normalized === 'deleted') {
      return AdStatus.DELETED;
    }

    return undefined;
  }

  private requiresModerationAfterOwnerEdit(status: AdStatus): boolean {
    return status === AdStatus.APPROVED || status === AdStatus.PUBLISHED;
  }

  private buildStatusUpdateData(status: AdStatus, metadataJson?: string | null): Prisma.AdUpdateInput {
    const now = new Date();
    const shouldDisableAutoRepeat =
      status === AdStatus.PAYMENT_PENDING ||
      status === AdStatus.PENDING_MODERATION ||
      status === AdStatus.REJECTED ||
      status === AdStatus.HIDDEN ||
      status === AdStatus.ARCHIVED ||
      status === AdStatus.DELETED;
    const currentPublicationSettings = shouldDisableAutoRepeat
      ? getAdPublicationSettings(metadataJson)
      : null;

    return {
      status,
      moderatedAt:
        status === AdStatus.APPROVED || status === AdStatus.REJECTED ? now : undefined,
      publishedAt: status === AdStatus.PUBLISHED ? now : undefined,
      hiddenAt: status === AdStatus.HIDDEN ? now : status === AdStatus.PAYMENT_PENDING || status === AdStatus.PENDING_MODERATION || status === AdStatus.APPROVED || status === AdStatus.PUBLISHED ? null : undefined,
      archivedAt: status === AdStatus.ARCHIVED ? now : status === AdStatus.PAYMENT_PENDING || status === AdStatus.PENDING_MODERATION || status === AdStatus.APPROVED || status === AdStatus.PUBLISHED ? null : undefined,
      deletedAt: status === AdStatus.DELETED ? now : status === AdStatus.PAYMENT_PENDING || status === AdStatus.PENDING_MODERATION || status === AdStatus.APPROVED || status === AdStatus.PUBLISHED ? null : undefined,
      metadataJson: currentPublicationSettings?.autoRepeat
        ? mergeAdPublicationSettings(metadataJson, {
            ...currentPublicationSettings,
            autoRepeat: false
          })
        : undefined
    };
  }
}
