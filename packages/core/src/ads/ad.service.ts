import { AdStatus, AdType, type Ad, type Prisma } from '@rabst24/db';
import { AppError, type AdListQueryDto, type AdTypeCode, type CreateAdDto } from '@rabst24/shared';
import type { ModerationQueueQuery, OwnedAdListQuery, AdRepository } from './ad.repository.js';
import { getAdPublicationSettings, mergeAdPublicationSettings, type AdPublicationSettings } from './ad-publication-settings.js';

export class AdService {
  private static readonly maxPhotos = 8;
  private static readonly maxVideos = 1;
  private readonly creationLocks = new Map<string, Promise<void>>();

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

  async getOwnedAdDetails(ownerId: string, adId: string) {
    const ad = await this.adRepository.findOwnedWithDetailsById(ownerId, adId);

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
      desiredPosition?: string | null;
    },
    options: { statusAfterPublicEdit?: AdStatus } = {}
  ) {
    const ad = await this.adRepository.updateOwned(ownerId, adId, dto, options);

    if (!ad) {
      throw new AppError('Ad not found', 404, { adId });
    }

    return ad;
  }

  async updateOwnerPublicationSettings(
    ownerId: string,
    adId: string,
    settings: Partial<AdPublicationSettings>
  ) {
    const existing = await this.getOwnedAdDetails(ownerId, adId);

    if (settings.autoRepeat === true) {
      throw new AppError('Автопубликация отключена администратором', 409, {
        code: 'AUTO_PUBLICATION_DISABLED',
        adId: existing.id
      });
    }

    const metadataJson = mergeAdPublicationSettings(existing.metadataJson, settings);
    const ad = await this.adRepository.updateOwnedMetadataJson(ownerId, adId, metadataJson);

    if (!ad) {
      throw new AppError('Ad not found', 404, { adId });
    }

    return ad;
  }

  async disableAutoRepeat(adId: string) {
    const existing = await this.getAdDetails(adId);
    const settings = getAdPublicationSettings(existing.metadataJson);

    if (!settings?.autoRepeat) {
      return existing;
    }

    const metadataJson = mergeAdPublicationSettings(existing.metadataJson, {
      ...settings,
      autoRepeat: false
    });
    const ad = await this.adRepository.updateMetadataJson(adId, metadataJson);

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

  async archiveOwnerAd(ownerId: string, adId: string) {
    const ad = await this.adRepository.updateOwnedStatus(ownerId, adId, AdStatus.ARCHIVED);

    if (!ad) {
      throw new AppError('Ad not found', 404, { adId });
    }

    return ad;
  }

  async deleteOwnerAd(ownerId: string, adId: string) {
    const ad = await this.adRepository.updateOwnedStatus(ownerId, adId, AdStatus.DELETED);

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
    const ad = await this.adRepository.markPublishedIfPublishable(adId);

    if (!ad) {
      throw new AppError('Only approved or published ads can be marked as published', 409, { adId });
    }

    return ad;
  }

  async createAdForModeration(
    ownerId: string,
    dto: CreateAdDto,
    options: { initialStatus?: AdStatus } = {}
  ): Promise<Ad> {
    const media = this.validateMediaSet(dto.photos);
    const adType = this.mapAdType(dto.type);

    return this.withCreationLock(this.getCreationLockKey(ownerId, adType), async () => {
      const data: Prisma.AdCreateInput = {
        owner: {
          connect: {
            id: ownerId
          }
        },
        type: adType,
        title: dto.title,
        description: dto.description,
        city: dto.city,
        districtText: dto.districtText,
        categoryText: dto.categoryText,
        priceAmount: dto.priceAmount,
        metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : undefined,
        isTest: this.isTestAd(dto),
        photos: {
          create: media.map((photo, index) => ({
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
                  profession: dto.resume.profession,
                  specialization: dto.resume.specialization,
                  experienceYears: dto.resume.experienceYears,
                  experienceText: dto.resume.experienceText,
                  employmentType: dto.resume.employmentType,
                  workFormat: dto.resume.workFormat,
                  desiredSchedule: dto.resume.desiredSchedule,
                  expectedSalary: dto.resume.expectedSalary,
                  salaryCurrency: dto.resume.salaryCurrency ?? 'RUB',
                  skillsJson: JSON.stringify(dto.resume.skills ?? []),
                  education: dto.resume.education,
                  availability: dto.resume.availability,
                  travelReady: dto.resume.travelReady ?? false,
                  siteAccommodationReady: dto.resume.siteAccommodationReady ?? false,
                  portfolioUrl: dto.resume.portfolioUrl
                }
              }
            : undefined,
        equipmentDetails:
          dto.type === 'equipment' && dto.equipment
            ? {
                create: dto.equipment
              }
            : undefined,
        productDetails:
          (dto.type === 'material' || dto.type === 'tool') && dto.product
            ? {
                create: dto.product
              }
            : undefined
      };

      const ad = await this.adRepository.createPending(data, options.initialStatus);

      return ad;
    });
  }

  private getCreationLockKey(ownerId: string, adType: AdType): string {
    return `${ownerId}:${adType}`;
  }

  private async withCreationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.creationLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = previous.catch(() => undefined).then(() => current);

    this.creationLocks.set(key, next);
    await previous.catch(() => undefined);

    try {
      return await task();
    } finally {
      release();

      if (this.creationLocks.get(key) === next) {
        this.creationLocks.delete(key);
      }
    }
  }

  private validateMediaSet(media: CreateAdDto['photos']): CreateAdDto['photos'] {
    const photosCount = media.filter((item) => !this.isVideoMedia(item.mimeType)).length;
    const videosCount = media.filter((item) => this.isVideoMedia(item.mimeType)).length;

    if (photosCount > AdService.maxPhotos) {
      throw new AppError(`Можно добавить до ${AdService.maxPhotos} фото. Лишние фото не сохранены.`, 400);
    }

    if (videosCount > AdService.maxVideos) {
      throw new AppError('Можно добавить только одно видео к объявлению.', 400);
    }

    return media.slice(0, AdService.maxPhotos + AdService.maxVideos);
  }

  private isVideoMedia(mimeType: string | null | undefined): boolean {
    return Boolean(mimeType?.toLowerCase().startsWith('video/'));
  }

  private mapAdType(type: CreateAdDto['type']) {
    if (type === 'vacancy') {
      return AdType.VACANCY;
    }

    if (type === 'resume') {
      return AdType.RESUME;
    }

    if (type === 'material') {
      return AdType.MATERIAL;
    }

    if (type === 'tool') {
      return AdType.TOOL;
    }

    return AdType.EQUIPMENT;
  }

  private isTestAd(dto: CreateAdDto): boolean {
    if (dto.metadata && dto.metadata.isTest === true) {
      return true;
    }

    return false;
  }

}
