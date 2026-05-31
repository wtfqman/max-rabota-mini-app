import type { AdService as CoreAdService } from '@rabst24/core';
import {
  canonicalizeCategory,
  canonicalizeDistrict,
  type AdListQueryDto,
  type CreateAdDto
} from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ModerationNotificationService } from '../moderation/moderation-notification.service.js';
import type { CreateResumeDto } from './resumes.schemas.js';
import type { ResumesRepository } from './resumes.repository.js';

export class ResumesService extends FoundationService {
  constructor(
    repository: ResumesRepository,
    private readonly coreAdService: CoreAdService,
    private readonly moderationNotificationService: ModerationNotificationService
  ) {
    super(repository);
  }

  async listPublic(query: AdListQueryDto) {
    return this.coreAdService.listPublicAds(query, 'resume');
  }

  async getPublicDetails(adId: string) {
    return this.coreAdService.getPublicAdDetails(adId, 'resume');
  }

  async createForModeration(ownerId: string, dto: CreateResumeDto) {
    const categoryText = canonicalizeCategory(dto.categoryText);
    const districtText = canonicalizeDistrict(dto.districtText);
    const createDto: CreateAdDto = {
      type: 'resume',
      title: dto.name,
      description: dto.description,
      districtText,
      categoryText,
      metadata: {
        address: dto.address,
        experienceText: dto.experienceText
      },
      photos: dto.photos,
      contacts: dto.contacts,
      requirements: [],
      responsibilities: [],
      benefits: [],
      resume: {
        desiredPosition: dto.profession,
        expectedSalary: dto.expectedSalary,
        salaryCurrency: 'RUB',
        skills: []
      }
    };

    const ad = await this.coreAdService.createAdForModeration(ownerId, createDto);
    void this.moderationNotificationService.notifyNewAd(ad, ownerId);

    return ad;
  }
}
