import { AdStatus, AdType, ModerationAction, type PrismaClient } from '@rabst24/db';
import { canonicalizeCategory, canonicalizeDistrict, type CreateAdDto } from '@rabst24/shared';
import type { AdWithDetailsRecord } from '@rabst24/core';
import type { SaveAdRevisionDto } from './ads.schemas.js';

export const AD_REVISION_STATUSES = [
  'DRAFT',
  'AWAITING_PAYMENT',
  'PENDING_MODERATION',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
] as const;

export type AdRevisionStatus = (typeof AD_REVISION_STATUSES)[number];

export interface AdRevisionDataSnapshot {
  title: string;
  description: string | null;
  city: string | null;
  districtText: string | null;
  categoryText: string | null;
  priceAmount: number | null;
  metadata: CreateAdDto['metadata'];
  desiredPosition?: string | null;
  contacts: CreateAdDto['contacts'];
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  vacancy?: CreateAdDto['vacancy'];
  resume?: CreateAdDto['resume'];
  equipment?: CreateAdDto['equipment'];
  product?: CreateAdDto['product'];
  mediaChanged: boolean;
}

export interface AdRevisionRecord {
  id: string;
  adId: string;
  version: number;
  status: AdRevisionStatus;
  dataJson: string;
  mediaJson: string | null;
  createdBy: string;
  paymentId: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const editableRevisionStatuses: AdRevisionStatus[] = ['DRAFT', 'REJECTED'];
const activeRevisionStatuses: AdRevisionStatus[] = ['DRAFT', 'AWAITING_PAYMENT', 'PENDING_MODERATION', 'REJECTED'];

export class AdRevisionRepository {
  constructor(private readonly db: PrismaClient) {}

  async saveDraft(ad: AdWithDetailsRecord, ownerId: string, dto: SaveAdRevisionDto): Promise<AdRevisionRecord> {
    const data = buildRevisionSnapshot(ad, dto);
    const media = dto.photos ? dto.photos : null;
    const existing = await this.findLatestByStatuses(ad.id, editableRevisionStatuses);

    if (existing) {
      return this.client().adRevision.update({
        where: {
          id: existing.id
        },
        data: {
          status: 'DRAFT',
          dataJson: JSON.stringify(data),
          mediaJson: media ? JSON.stringify(media) : null,
          submittedAt: null,
          rejectedAt: null,
          rejectionReason: null,
          cancelledAt: null
        }
      });
    }

    const latest = await this.client().adRevision.findFirst({
      where: {
        adId: ad.id
      },
      orderBy: {
        version: 'desc'
      },
      select: {
        version: true
      }
    });

    return this.client().adRevision.create({
      data: {
        adId: ad.id,
        version: (latest?.version ?? 0) + 1,
        status: 'DRAFT',
        dataJson: JSON.stringify(data),
        mediaJson: media ? JSON.stringify(media) : null,
        createdBy: ownerId
      }
    });
  }

  findLatestActive(adId: string): Promise<AdRevisionRecord | null> {
    return this.findLatestByStatuses(adId, activeRevisionStatuses);
  }

  findLatestPendingModeration(adId: string): Promise<AdRevisionRecord | null> {
    return this.findLatestByStatuses(adId, ['PENDING_MODERATION']);
  }

  findByPaymentId(paymentId: string): Promise<AdRevisionRecord | null> {
    return this.client().adRevision.findFirst({
      where: {
        paymentId
      }
    });
  }

  listForAd(adId: string): Promise<AdRevisionRecord[]> {
    return this.client().adRevision.findMany({
      where: {
        adId
      },
      orderBy: {
        version: 'desc'
      }
    });
  }

  async markSubmitted(revisionId: string): Promise<AdRevisionRecord> {
    const revision = await this.client().adRevision.update({
      where: {
        id: revisionId
      },
      data: {
        status: 'PENDING_MODERATION',
        submittedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null
      }
    });

    await this.setAdRevisionMarker(revision.adId, revision.id, 'PENDING_MODERATION');

    return revision;
  }

  async markAwaitingPayment(revisionId: string, paymentId: string): Promise<AdRevisionRecord> {
    const revision = await this.client().adRevision.update({
      where: {
        id: revisionId
      },
      data: {
        status: 'AWAITING_PAYMENT',
        paymentId
      }
    });

    await this.setAdRevisionMarker(revision.adId, revision.id, 'AWAITING_PAYMENT');

    return revision;
  }

  async markSubmittedByPaymentId(paymentId: string): Promise<AdRevisionRecord | null> {
    const revision = await this.findByPaymentId(paymentId);

    if (!revision || revision.status !== 'AWAITING_PAYMENT') {
      return revision;
    }

    return this.markSubmitted(revision.id);
  }

  async cancel(ownerId: string, adId: string): Promise<AdRevisionRecord> {
    const revision = await this.findLatestActive(adId);

    if (!revision || revision.createdBy !== ownerId) {
      throw new Error('Active revision not found');
    }

    const cancelled = await this.client().adRevision.update({
      where: {
        id: revision.id
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date()
      }
    });

    await this.clearAdRevisionMarker(adId);

    return cancelled;
  }

  async rejectPending(adId: string, reason: string): Promise<AdRevisionRecord | null> {
    const revision = await this.findLatestPendingModeration(adId);

    if (!revision) {
      return null;
    }

    const rejected = await this.client().adRevision.update({
      where: {
        id: revision.id
      },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason
      }
    });

    await this.clearAdRevisionMarker(adId);

    return rejected;
  }

  async approvePending(adId: string, moderatorId: string): Promise<AdRevisionRecord | null> {
    const revision = await this.findLatestPendingModeration(adId);

    if (!revision) {
      return null;
    }

    const data = parseRevisionData(revision.dataJson);
    const media = parseRevisionMedia(revision.mediaJson);
    const now = new Date();
    const currentAd = await this.client().ad.findUnique({
      where: {
        id: adId
      },
      select: {
        status: true
      }
    });

    await this.client().$transaction(async (tx: unknown) => {
      const client = tx as {
        ad: {
          update: (payload: unknown) => Promise<unknown>;
        };
        adPhoto: {
          updateMany: (payload: unknown) => Promise<unknown>;
          createMany: (payload: unknown) => Promise<unknown>;
        };
        resumeDetails: {
          upsert: (payload: unknown) => Promise<unknown>;
        };
        vacancyDetails: {
          upsert: (payload: unknown) => Promise<unknown>;
        };
        equipmentDetails: {
          upsert: (payload: unknown) => Promise<unknown>;
        };
        productDetails: {
          upsert: (payload: unknown) => Promise<unknown>;
        };
        adContact: {
          updateMany: (payload: unknown) => Promise<unknown>;
          createMany: (payload: unknown) => Promise<unknown>;
        };
        adRequirement: {
          deleteMany: (payload: unknown) => Promise<unknown>;
          createMany: (payload: unknown) => Promise<unknown>;
        };
        adResponsibility: {
          deleteMany: (payload: unknown) => Promise<unknown>;
          createMany: (payload: unknown) => Promise<unknown>;
        };
        adBenefit: {
          deleteMany: (payload: unknown) => Promise<unknown>;
          createMany: (payload: unknown) => Promise<unknown>;
        };
        moderationLog: {
          create: (payload: unknown) => Promise<unknown>;
        };
        adRevision: {
          update: (payload: unknown) => Promise<unknown>;
        };
      };

      await client.ad.update({
        where: {
          id: adId
        },
        data: {
          title: data.title,
          description: data.description,
          city: data.city,
          districtText: canonicalizeDistrict(data.districtText),
          categoryText: canonicalizeCategory(data.categoryText),
          priceAmount: data.priceAmount,
          metadataJson: JSON.stringify(data.metadata ?? {}),
          status: AdStatus.APPROVED,
          hiddenAt: null,
          archivedAt: null,
          deletedAt: null
        }
      });

      if (data.desiredPosition !== undefined) {
        await client.resumeDetails.upsert({
          where: {
            adId
          },
          update: {
            desiredPosition: data.desiredPosition
          },
          create: {
            adId,
            desiredPosition: data.desiredPosition
          }
        });
      }

      if (data.vacancy) {
        await client.vacancyDetails.upsert({
          where: { adId },
          update: {
            ...data.vacancy,
            salaryCurrency: data.vacancy.salaryCurrency ?? 'RUB',
            isSalaryNegotiable: data.vacancy.isSalaryNegotiable ?? false,
            providesAccommodation: data.vacancy.providesAccommodation ?? false,
            providesMeals: data.vacancy.providesMeals ?? false
          },
          create: {
            adId,
            ...data.vacancy,
            salaryCurrency: data.vacancy.salaryCurrency ?? 'RUB',
            isSalaryNegotiable: data.vacancy.isSalaryNegotiable ?? false,
            providesAccommodation: data.vacancy.providesAccommodation ?? false,
            providesMeals: data.vacancy.providesMeals ?? false
          }
        });
      }

      if (data.resume) {
        await client.resumeDetails.upsert({
          where: { adId },
          update: {
            desiredPosition: data.resume.desiredPosition,
            profession: data.resume.profession,
            specialization: data.resume.specialization,
            experienceYears: data.resume.experienceYears,
            experienceText: data.resume.experienceText,
            employmentType: data.resume.employmentType,
            workFormat: data.resume.workFormat,
            desiredSchedule: data.resume.desiredSchedule,
            expectedSalary: data.resume.expectedSalary,
            salaryCurrency: data.resume.salaryCurrency ?? 'RUB',
            skillsJson: JSON.stringify(data.resume.skills ?? []),
            education: data.resume.education,
            availability: data.resume.availability,
            travelReady: data.resume.travelReady ?? false,
            siteAccommodationReady: data.resume.siteAccommodationReady ?? false,
            portfolioUrl: data.resume.portfolioUrl
          },
          create: {
            adId,
            desiredPosition: data.resume.desiredPosition,
            profession: data.resume.profession,
            specialization: data.resume.specialization,
            experienceYears: data.resume.experienceYears,
            experienceText: data.resume.experienceText,
            employmentType: data.resume.employmentType,
            workFormat: data.resume.workFormat,
            desiredSchedule: data.resume.desiredSchedule,
            expectedSalary: data.resume.expectedSalary,
            salaryCurrency: data.resume.salaryCurrency ?? 'RUB',
            skillsJson: JSON.stringify(data.resume.skills ?? []),
            education: data.resume.education,
            availability: data.resume.availability,
            travelReady: data.resume.travelReady ?? false,
            siteAccommodationReady: data.resume.siteAccommodationReady ?? false,
            portfolioUrl: data.resume.portfolioUrl
          }
        });
      }

      if (data.equipment) {
        await client.equipmentDetails.upsert({
          where: { adId },
          update: data.equipment,
          create: {
            adId,
            ...data.equipment
          }
        });
      }

      if (data.product) {
        await client.productDetails.upsert({
          where: { adId },
          update: data.product,
          create: {
            adId,
            ...data.product
          }
        });
      }

      await client.adContact.updateMany({
        where: { adId, deletedAt: null },
        data: { deletedAt: now }
      });

      if (data.contacts.length > 0) {
        await client.adContact.createMany({
          data: data.contacts.map((contact, index) => ({
            adId,
            type: contact.type,
            label: contact.label,
            value: contact.value,
            isPreferred: contact.isPreferred ?? index === 0,
            sortOrder: index
          }))
        });
      }

      await client.adRequirement.deleteMany({ where: { adId } });
      await client.adResponsibility.deleteMany({ where: { adId } });
      await client.adBenefit.deleteMany({ where: { adId } });

      if (data.requirements.length > 0) {
        await client.adRequirement.createMany({
          data: data.requirements.map((text, index) => ({ adId, text, sortOrder: index }))
        });
      }

      if (data.responsibilities.length > 0) {
        await client.adResponsibility.createMany({
          data: data.responsibilities.map((text, index) => ({ adId, text, sortOrder: index }))
        });
      }

      if (data.benefits.length > 0) {
        await client.adBenefit.createMany({
          data: data.benefits.map((text, index) => ({ adId, text, sortOrder: index }))
        });
      }

      if (media) {
        await client.adPhoto.updateMany({
          where: {
            adId,
            deletedAt: null
          },
          data: {
            deletedAt: now
          }
        });

        if (media.length > 0) {
          await client.adPhoto.createMany({
            data: media.map((photo, index) => ({
              adId,
              storageKey: photo.storageKey,
              url: photo.url,
              previewUrl: photo.previewUrl,
              mimeType: photo.mimeType,
              sizeBytes: photo.sizeBytes,
              width: photo.width,
              height: photo.height,
              altText: photo.altText,
              sortOrder: index
            }))
          });
        }
      }

      await client.adRevision.update({
        where: {
          id: revision.id
        },
        data: {
          status: 'APPROVED',
          approvedAt: now
        }
      });

      await client.moderationLog.create({
        data: {
          adId,
          moderatorId,
          action: ModerationAction.APPROVED,
          statusFrom: currentAd?.status ?? AdStatus.PUBLISHED,
          statusTo: AdStatus.APPROVED,
          metadataJson: JSON.stringify({
            revisionId: revision.id,
            version: revision.version
          })
        }
      });
    });

    await this.clearAdRevisionMarker(adId);

    return this.client().adRevision.findUnique({
      where: {
        id: revision.id
      }
    });
  }

  private findLatestByStatuses(adId: string, statuses: AdRevisionStatus[]): Promise<AdRevisionRecord | null> {
    return this.client().adRevision.findFirst({
      where: {
        adId,
        status: {
          in: statuses
        }
      },
      orderBy: {
        version: 'desc'
      }
    });
  }

  private client() {
    return this.db as unknown as {
      $transaction: <T>(task: (tx: unknown) => Promise<T>) => Promise<T>;
      ad: {
        findUnique: (payload: unknown) => Promise<{ metadataJson: string | null; status?: AdStatus } | null>;
        update: (payload: unknown) => Promise<unknown>;
      };
      adRevision: {
        create: (payload: unknown) => Promise<AdRevisionRecord>;
        update: (payload: unknown) => Promise<AdRevisionRecord>;
        findFirst: (payload: unknown) => Promise<AdRevisionRecord | null>;
        findMany: (payload: unknown) => Promise<AdRevisionRecord[]>;
        findUnique: (payload: unknown) => Promise<AdRevisionRecord | null>;
      };
    };
  }

  private async setAdRevisionMarker(adId: string, revisionId: string, status: AdRevisionStatus): Promise<void> {
    const existing = await this.client().ad.findUnique({
      where: {
        id: adId
      },
      select: {
        metadataJson: true
      }
    });
    const metadata = parseMetadata(existing?.metadataJson);

    await this.client().ad.update({
      where: {
        id: adId
      },
      data: {
        metadataJson: JSON.stringify({
          ...metadata,
          activeRevisionId: revisionId,
          activeRevisionStatus: status
        })
      }
    });
  }

  private async clearAdRevisionMarker(adId: string): Promise<void> {
    const existing = await this.client().ad.findUnique({
      where: {
        id: adId
      },
      select: {
        metadataJson: true
      }
    });
    const metadata = parseMetadata(existing?.metadataJson);
    delete metadata.activeRevisionId;
    delete metadata.activeRevisionStatus;

    await this.client().ad.update({
      where: {
        id: adId
      },
      data: {
        metadataJson: JSON.stringify(metadata)
      }
    });
  }
}

export function parseRevisionData(value: string): AdRevisionDataSnapshot {
  return JSON.parse(value) as AdRevisionDataSnapshot;
}

export function parseRevisionMedia(value: string | null): CreateAdDto['photos'] | null {
  if (!value) {
    return null;
  }

  return JSON.parse(value) as CreateAdDto['photos'];
}

function buildRevisionSnapshot(ad: AdWithDetailsRecord, dto: SaveAdRevisionDto): AdRevisionDataSnapshot {
  const currentPhotos = toPhotoSnapshot(ad);
  const nextPhotos = dto.photos ?? currentPhotos;
  const currentMetadata = parseMetadata(ad.metadataJson);

  return {
    title: dto.title ?? ad.title,
    description: dto.description === undefined ? ad.description : dto.description,
    city: dto.city === undefined ? ad.city : dto.city,
    districtText: dto.districtText === undefined ? ad.districtText : dto.districtText,
    categoryText: dto.categoryText === undefined ? ad.categoryText : dto.categoryText,
    priceAmount: dto.priceAmount === undefined ? toNumberOrNull(ad.priceAmount) : dto.priceAmount,
    metadata: dto.metadata ? { ...currentMetadata, ...dto.metadata } : currentMetadata,
    desiredPosition:
      ad.type === AdType.RESUME
        ? dto.desiredPosition === undefined
          ? ad.resumeDetails?.desiredPosition ?? null
          : dto.desiredPosition
        : undefined,
    contacts: dto.contacts ?? toContactSnapshot(ad),
    requirements: dto.requirements ?? ad.requirements.map((item) => item.text),
    responsibilities: dto.responsibilities ?? ad.responsibilities.map((item) => item.text),
    benefits: dto.benefits ?? ad.benefits.map((item) => item.text),
    vacancy: ad.type === AdType.VACANCY ? dto.vacancy ?? toVacancySnapshot(ad) : undefined,
    resume: ad.type === AdType.RESUME ? dto.resume ?? toResumeSnapshot(ad) : undefined,
    equipment: ad.type === AdType.EQUIPMENT ? dto.equipment ?? toEquipmentSnapshot(ad) : undefined,
    product: ad.type === AdType.MATERIAL || ad.type === AdType.TOOL ? dto.product ?? toProductSnapshot(ad) : undefined,
    mediaChanged: dto.photos !== undefined && JSON.stringify(nextPhotos) !== JSON.stringify(currentPhotos)
  };
}

function toContactSnapshot(ad: AdWithDetailsRecord): CreateAdDto['contacts'] {
  return ad.contacts.map((contact) => ({
    type: contact.type,
    label: contact.label ?? undefined,
    value: contact.value,
    isPreferred: contact.isPreferred
  }));
}

function toVacancySnapshot(ad: AdWithDetailsRecord): CreateAdDto['vacancy'] {
  if (!ad.vacancyDetails) {
    return undefined;
  }

  return {
    companyName: ad.vacancyDetails.companyName ?? undefined,
    position: ad.vacancyDetails.position ?? undefined,
    employmentType: ad.vacancyDetails.employmentType ?? undefined,
    workFormat: ad.vacancyDetails.workFormat ?? undefined,
    salaryFrom: ad.vacancyDetails.salaryFrom ?? undefined,
    salaryTo: ad.vacancyDetails.salaryTo ?? undefined,
    salaryCurrency: ad.vacancyDetails.salaryCurrency ?? undefined,
    salaryPeriod: ad.vacancyDetails.salaryPeriod ?? undefined,
    paymentFormat: ad.vacancyDetails.paymentFormat ?? undefined,
    isSalaryNegotiable: ad.vacancyDetails.isSalaryNegotiable,
    schedule: ad.vacancyDetails.schedule ?? undefined,
    experience: ad.vacancyDetails.experience ?? undefined,
    education: ad.vacancyDetails.education ?? undefined,
    providesAccommodation: ad.vacancyDetails.providesAccommodation,
    providesMeals: ad.vacancyDetails.providesMeals,
    projectDuration: ad.vacancyDetails.projectDuration ?? undefined
  };
}

function toResumeSnapshot(ad: AdWithDetailsRecord): CreateAdDto['resume'] {
  if (!ad.resumeDetails) {
    return undefined;
  }

  return {
    desiredPosition: ad.resumeDetails.desiredPosition ?? undefined,
    profession: ad.resumeDetails.profession ?? undefined,
    specialization: ad.resumeDetails.specialization ?? undefined,
    experienceYears: ad.resumeDetails.experienceYears ?? undefined,
    experienceText: ad.resumeDetails.experienceText ?? undefined,
    employmentType: ad.resumeDetails.employmentType ?? undefined,
    workFormat: ad.resumeDetails.workFormat ?? undefined,
    desiredSchedule: ad.resumeDetails.desiredSchedule ?? undefined,
    expectedSalary: ad.resumeDetails.expectedSalary ?? undefined,
    salaryCurrency: ad.resumeDetails.salaryCurrency ?? undefined,
    skills: parseJsonStringArray(ad.resumeDetails.skillsJson),
    education: ad.resumeDetails.education ?? undefined,
    availability: ad.resumeDetails.availability ?? undefined,
    travelReady: ad.resumeDetails.travelReady,
    siteAccommodationReady: ad.resumeDetails.siteAccommodationReady,
    portfolioUrl: ad.resumeDetails.portfolioUrl ?? undefined
  };
}

function toEquipmentSnapshot(ad: AdWithDetailsRecord): CreateAdDto['equipment'] {
  if (!ad.equipmentDetails) {
    return undefined;
  }

  return {
    categoryText: ad.equipmentDetails.categoryText ?? undefined,
    dealType: ad.equipmentDetails.dealType ?? undefined,
    condition: ad.equipmentDetails.condition ?? undefined,
    brand: ad.equipmentDetails.brand ?? undefined,
    model: ad.equipmentDetails.model ?? undefined,
    productionYear: ad.equipmentDetails.productionYear ?? undefined,
    hourlyPrice: ad.equipmentDetails.hourlyPrice ?? undefined,
    shiftPrice: ad.equipmentDetails.shiftPrice ?? undefined,
    dailyPrice: ad.equipmentDetails.dailyPrice ?? undefined,
    rentalPrice: ad.equipmentDetails.rentalPrice ?? undefined,
    salePrice: ad.equipmentDetails.salePrice ?? undefined,
    depositAmount: ad.equipmentDetails.depositAmount ?? undefined,
    currency: ad.equipmentDetails.currency ?? undefined,
    operatorIncluded: ad.equipmentDetails.operatorIncluded,
    deliveryAvailable: ad.equipmentDetails.deliveryAvailable,
    availability: ad.equipmentDetails.availability ?? undefined
  };
}

function toProductSnapshot(ad: AdWithDetailsRecord): CreateAdDto['product'] {
  const productDetails = ad.productDetails;

  if (!productDetails) {
    return undefined;
  }

  return {
    manufacturer: productDetails.manufacturer ?? undefined,
    model: productDetails.model ?? undefined,
    condition: productDetails.condition ?? undefined,
    quantity: productDetails.quantity ?? undefined,
    unit: productDetails.unit ?? undefined,
    saleType: productDetails.saleType ?? undefined,
    deliveryAvailable: productDetails.deliveryAvailable
  };
}

function toPhotoSnapshot(ad: AdWithDetailsRecord): CreateAdDto['photos'] {
  return ad.photos.map((photo) => ({
    storageKey: photo.storageKey,
    url: photo.url,
    previewUrl: photo.previewUrl ?? undefined,
    mimeType: photo.mimeType ?? undefined,
    sizeBytes: photo.sizeBytes ?? undefined,
    width: photo.width ?? undefined,
    height: photo.height ?? undefined,
    altText: photo.altText ?? undefined
  }));
}

function parseJsonStringArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMetadata(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
