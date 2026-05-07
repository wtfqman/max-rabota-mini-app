import { AdStatus, AdType, type Ad, type Prisma } from '@rabst24/db';
import { AppError, type AdListQueryDto, type AdTypeCode, type CreateAdDto } from '@rabst24/shared';
import type { ModerationQueueQuery, OwnedAdListQuery, AdRepository } from './ad.repository.js';

export class AdService {
  constructor(private readonly adRepository: AdRepository) {}

  async listPublicAds(query: AdListQueryDto, forcedType?: AdTypeCode) {
    return this.adRepository.listPublic(query, forcedType);
  }

  async getPublicAdDetails(adId: string, forcedType?: AdTypeCode) {
    const ad = await this.adRepository.findPublicById(adId, forcedType);

    if (!ad) {
      throw new AppError('Ad not found', 404, {
        adId
      });
    }

    return ad;
  }

  async getAdDetails(adId: string) {
    const ad = await this.adRepository.findWithDetailsById(adId);

    if (!ad) {
      throw new AppError('Ad not found', 404, { adId });
    }

    return ad;
  }

  async listModerationQueue(query: ModerationQueueQuery) {
    return this.adRepository.listForModeration(query);
  }

  async listOwnerAds(ownerId: string, query: OwnedAdListQuery) {
    return this.adRepository.listOwned(ownerId, query);
  }

  async updateOwnerAd(
    ownerId: string,
    adId: string,
    dto: {
      title?: string;
      description?: string | null;
      city?: string | null;
      districtText?: string | null;
      categoryText?: string | null;
    }
  ) {
    const ad = await this.adRepository.updateOwned(ownerId, adId, dto);

    if (!ad) {
      throw new AppError('Ad not found', 404, { adId });
    }

    return ad;
  }

  async hideOwnerAd(ownerId: string, adId: string) {
    const ad = await this.adRepository.updateOwnedStatus(ownerId, adId, AdStatus.HIDDEN);

    if (!ad) {
      throw new AppError('Ad not found', 404, { adId });
    }

    return ad;
  }

  async resubmitOwnerAd(ownerId: string, adId: string) {
    const ad = await this.adRepository.updateOwnedStatus(ownerId, adId, AdStatus.PENDING_MODERATION);

    if (!ad) {
      throw new AppError('Ad not found', 404, { adId });
    }

    return ad;
  }

  async markAdPublished(adId: string) {
    await this.adRepository.updateStatus(adId, AdStatus.PUBLISHED);
    return this.getAdDetails(adId);
  }

  async createAdForModeration(ownerId: string, dto: CreateAdDto): Promise<Ad> {
    const data: Prisma.AdCreateInput = {
      owner: {
        connect: {
          id: ownerId
        }
      },
      type: this.mapAdType(dto.type),
      title: dto.title,
      description: dto.description,
      city: dto.city,
      districtText: dto.districtText,
      categoryText: dto.categoryText,
      priceAmount: dto.priceAmount,
      metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : undefined,
      photos: {
        create: dto.photos.map((photo, index) => ({
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
      },
      contacts: {
        create: dto.contacts.map((contact, index) => ({
          type: contact.type,
          value: contact.value,
          label: contact.label,
          isPreferred: contact.isPreferred ?? index === 0,
          sortOrder: index
        }))
      },
      requirements: {
        create: dto.requirements.map((text, index) => ({
          text,
          sortOrder: index
        }))
      },
      responsibilities: {
        create: dto.responsibilities.map((text, index) => ({
          text,
          sortOrder: index
        }))
      },
      benefits: {
        create: dto.benefits.map((text, index) => ({
          text,
          sortOrder: index
        }))
      },
      vacancyDetails:
        dto.type === 'vacancy' && dto.vacancy
          ? {
              create: {
                ...dto.vacancy,
                salaryCurrency: dto.vacancy.salaryCurrency ?? 'RUB',
                isSalaryNegotiable: dto.vacancy.isSalaryNegotiable ?? false
              }
            }
          : undefined,
      resumeDetails:
        dto.type === 'resume' && dto.resume
          ? {
              create: {
                desiredPosition: dto.resume.desiredPosition,
                experienceYears: dto.resume.experienceYears,
                skillsJson: JSON.stringify(dto.resume.skills ?? [])
              }
            }
          : undefined,
      equipmentDetails:
        dto.type === 'equipment' && dto.equipment
          ? {
              create: dto.equipment
            }
          : undefined
    };

    return this.adRepository.createPending(data);
  }

  private mapAdType(type: CreateAdDto['type']) {
    if (type === 'vacancy') {
      return AdType.VACANCY;
    }

    if (type === 'resume') {
      return AdType.RESUME;
    }

    return AdType.EQUIPMENT;
  }
}
