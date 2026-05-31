import { AdStatus, AdType, type Ad, type Prisma } from '@rabst24/db';
import { AppError, type AdListQueryDto, type AdTypeCode, type CreateAdDto } from '@rabst24/shared';
import type { DuplicateCandidateRecord, ModerationQueueQuery, OwnedAdListQuery, AdRepository } from './ad.repository.js';
import { mergeAdPublicationSettings, type AdPublicationSettings } from './ad-publication-settings.js';

export class AdService {
  private static readonly maxPhotos = 8;
  private static readonly maxVideos = 1;
  private static readonly duplicateWindowMs = 24 * 60 * 60 * 1000;
  private static readonly duplicateFullSimilarityThreshold = 0.86;
  private static readonly duplicateTitleSimilarityThreshold = 0.75;
  private static readonly duplicateTextSimilarityThreshold = 0.72;
  private static readonly duplicateMinSoftTokens = 6;

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
    }
  ) {
    const ad = await this.adRepository.updateOwned(ownerId, adId, dto);

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
    const metadataJson = mergeAdPublicationSettings(existing.metadataJson, settings);
    const ad = await this.adRepository.updateOwnedMetadataJson(ownerId, adId, metadataJson);

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
    await this.adRepository.updateStatus(adId, AdStatus.PUBLISHED);
    return this.getAdDetails(adId);
  }

  async createAdForModeration(ownerId: string, dto: CreateAdDto): Promise<Ad> {
    const media = this.validateMediaSet(dto.photos);
    const adType = this.mapAdType(dto.type);

    await this.ensureNotRecentDuplicate(ownerId, adType, dto);

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
                experienceYears: dto.resume.experienceYears,
                expectedSalary: dto.resume.expectedSalary,
                salaryCurrency: dto.resume.salaryCurrency ?? 'RUB',
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

  private async ensureNotRecentDuplicate(ownerId: string, adType: AdType, dto: CreateAdDto): Promise<void> {
    const createdSince = new Date(Date.now() - AdService.duplicateWindowMs);
    const candidateAds = await this.adRepository.listRecentDuplicateCandidates(ownerId, adType, createdSince);
    const next = this.buildDuplicateComparable(dto, adType);

    for (const candidate of candidateAds) {
      const current = this.buildCandidateComparable(candidate);
      const match = this.getDuplicateMatch(next, current);

      if (!match.isDuplicate) {
        continue;
      }

      throw new AppError(
        'Похожее объявление уже отправлялось сегодня. Обновите существующее объявление или попробуйте завтра.',
        409,
        {
          code: 'DUPLICATE_AD',
          duplicateAdId: candidate.id,
          duplicateCreatedAt: candidate.createdAt.toISOString(),
          duplicateStatus: candidate.status.toLowerCase(),
          matchReason: match.reason,
          similarity: match.similarity
        }
      );
    }
  }

  private getDuplicateMatch(
    next: DuplicateComparable,
    current: DuplicateComparable
  ): { isDuplicate: true; reason: string; similarity: number } | { isDuplicate: false } {
    if (next.signature && next.signature === current.signature) {
      return {
        isDuplicate: true,
        reason: 'exact',
        similarity: 1
      };
    }

    if (next.tokens.length < AdService.duplicateMinSoftTokens || current.tokens.length < AdService.duplicateMinSoftTokens) {
      return { isDuplicate: false };
    }

    if (!this.areRolesCompatible(next.roleTokens, current.roleTokens)) {
      return { isDuplicate: false };
    }

    const fullSimilarity = this.tokenDice(next.tokens, current.tokens);
    const titleSimilarity = this.tokenDice(next.titleTokens, current.titleTokens);

    if (fullSimilarity >= AdService.duplicateFullSimilarityThreshold) {
      return {
        isDuplicate: true,
        reason: 'similar_text',
        similarity: Number(fullSimilarity.toFixed(3))
      };
    }

    if (
      titleSimilarity >= AdService.duplicateTitleSimilarityThreshold &&
      fullSimilarity >= AdService.duplicateTextSimilarityThreshold
    ) {
      return {
        isDuplicate: true,
        reason: 'similar_title_and_text',
        similarity: Number(fullSimilarity.toFixed(3))
      };
    }

    return { isDuplicate: false };
  }

  private areRolesCompatible(nextTokens: string[], currentTokens: string[]): boolean {
    if (nextTokens.length === 0 || currentTokens.length === 0) {
      return true;
    }

    const next = new Set(nextTokens);
    const current = new Set(currentTokens);
    let overlap = 0;

    for (const token of next) {
      if (current.has(token)) {
        overlap += 1;
      }
    }

    return overlap / Math.min(next.size, current.size) >= 0.25;
  }

  private buildDuplicateComparable(dto: CreateAdDto, adType: AdType): DuplicateComparable {
    const metadata = this.stringifyMetadata(dto.metadata);
    const roleText = this.joinText([
      dto.title,
      dto.categoryText,
      dto.vacancy?.position,
      dto.resume?.desiredPosition,
      dto.equipment?.categoryText,
      dto.equipment?.brand,
      dto.equipment?.model
    ]);
    const priceText = this.joinText([
      dto.priceAmount,
      dto.vacancy?.salaryFrom,
      dto.vacancy?.salaryTo,
      dto.vacancy?.salaryPeriod,
      dto.resume?.expectedSalary
    ]);
    const fullText = this.joinText([
      adType,
      dto.title,
      dto.description,
      dto.city,
      dto.districtText,
      dto.categoryText,
      priceText,
      metadata,
      dto.requirements,
      dto.responsibilities,
      dto.benefits,
      dto.vacancy?.companyName,
      dto.vacancy?.position,
      dto.vacancy?.schedule,
      dto.vacancy?.experience,
      dto.resume?.desiredPosition,
      dto.equipment?.categoryText,
      dto.equipment?.brand,
      dto.equipment?.model
    ]);

    return this.toDuplicateComparable(fullText, dto.title, roleText);
  }

  private buildCandidateComparable(candidate: DuplicateCandidateRecord): DuplicateComparable {
    const metadata = this.stringifyMetadata(this.parseMetadata(candidate.metadataJson));
    const roleText = this.joinText([
      candidate.title,
      candidate.categoryText,
      candidate.vacancyDetails?.position,
      candidate.resumeDetails?.desiredPosition,
      candidate.equipmentDetails?.categoryText,
      candidate.equipmentDetails?.brand,
      candidate.equipmentDetails?.model
    ]);
    const priceText = this.joinText([
      candidate.priceAmount,
      candidate.vacancyDetails?.salaryFrom,
      candidate.vacancyDetails?.salaryTo,
      candidate.vacancyDetails?.salaryPeriod,
      candidate.resumeDetails?.expectedSalary
    ]);
    const fullText = this.joinText([
      candidate.type,
      candidate.title,
      candidate.description,
      candidate.city,
      candidate.districtText,
      candidate.categoryText,
      priceText,
      metadata,
      candidate.requirements.map((item) => item.text),
      candidate.responsibilities.map((item) => item.text),
      candidate.benefits.map((item) => item.text),
      candidate.vacancyDetails?.companyName,
      candidate.vacancyDetails?.position,
      candidate.vacancyDetails?.schedule,
      candidate.vacancyDetails?.experience,
      candidate.resumeDetails?.desiredPosition,
      candidate.equipmentDetails?.categoryText,
      candidate.equipmentDetails?.brand,
      candidate.equipmentDetails?.model
    ]);

    return this.toDuplicateComparable(fullText, candidate.title, roleText);
  }

  private toDuplicateComparable(fullText: string, title: string, roleText: string): DuplicateComparable {
    const signature = this.normalizeText(fullText);

    return {
      signature,
      tokens: this.tokenize(signature),
      titleTokens: this.tokenize(this.normalizeText(title)),
      roleTokens: this.tokenize(this.normalizeText(roleText))
    };
  }

  private tokenDice(leftTokens: string[], rightTokens: string[]): number {
    if (leftTokens.length === 0 || rightTokens.length === 0) {
      return 0;
    }

    const left = new Set(leftTokens);
    const right = new Set(rightTokens);
    let overlap = 0;

    for (const token of left) {
      if (right.has(token)) {
        overlap += 1;
      }
    }

    return (2 * overlap) / (left.size + right.size);
  }

  private tokenize(value: string): string[] {
    if (!value) {
      return [];
    }

    return value
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !duplicateStopWords.has(token));
  }

  private normalizeText(value: string): string {
    return value
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g, 'е')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private joinText(values: unknown[]): string {
    return values.flatMap((value) => this.flattenText(value)).join(' ');
  }

  private flattenText(value: unknown): string[] {
    if (value === null || value === undefined) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item) => this.flattenText(item));
    }

    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'publicationSettings')
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .flatMap(([, entryValue]) => this.flattenText(entryValue));
    }

    return [String(value)];
  }

  private stringifyMetadata(metadata: Record<string, unknown> | undefined): string {
    return this.joinText([metadata ?? {}]);
  }

  private parseMetadata(metadataJson: string | null): Record<string, unknown> | undefined {
    if (!metadataJson) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(metadataJson) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
    } catch {
      return undefined;
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

interface DuplicateComparable {
  signature: string;
  tokens: string[];
  titleTokens: string[];
  roleTokens: string[];
}

const duplicateStopWords = new Set([
  'в',
  'во',
  'и',
  'или',
  'на',
  'по',
  'за',
  'для',
  'с',
  'со',
  'от',
  'до',
  'из',
  'к',
  'ко',
  'у',
  'о',
  'об',
  'без',
  'при',
  'это',
  'как',
  'что',
  'требуется',
  'требуются',
  'нужен',
  'нужна',
  'нужны',
  'ищем',
  'работа',
  'работу',
  'работник',
  'работники',
  'рабочий',
  'рабочие',
  'специалист',
  'специалисты',
  'мастер',
  'мастера',
  'бригада',
  'бригады',
  'услуга',
  'услуги',
  'объект',
  'объекты',
  'день',
  'дня',
  'руб',
  'рублей',
  'р',
  '₽'
]);
