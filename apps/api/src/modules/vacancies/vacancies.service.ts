import type { AdService as CoreAdService, UserService } from '@rabst24/core';
import {
  canonicalizeCategory,
  canonicalizeDistrict,
  type AdListQueryDto,
  type CreateAdDto
} from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ModerationNotificationService } from '../moderation/moderation-notification.service.js';
import type { CreateVacancyDto } from './vacancies.schemas.js';
import type { VacanciesRepository } from './vacancies.repository.js';

export class VacanciesService extends FoundationService {
  constructor(
    repository: VacanciesRepository,
    private readonly coreAdService: CoreAdService,
    private readonly userService: UserService,
    private readonly moderationNotificationService: ModerationNotificationService
  ) {
    super(repository);
  }

  async listPublic(query: AdListQueryDto) {
    return this.coreAdService.listPublicAds(query, 'vacancy');
  }

  async getPublicDetails(adId: string) {
    return this.coreAdService.getPublicAdDetails(adId, 'vacancy');
  }

  async createForModeration(ownerId: string, dto: CreateVacancyDto) {
    const categoryText = canonicalizeCategory(dto.categoryText);
    const districtText = canonicalizeDistrict(dto.districtText);
    const companyName = await this.resolveCompanyName(ownerId, dto.companyName);
    const createDto: CreateAdDto = {
      type: 'vacancy',
      title: dto.title,
      description: dto.description,
      city: dto.city,
      districtText,
      categoryText,
      metadata: {
        address: dto.address,
        salaryText: dto.salaryText,
        workPeriods: dto.workPeriods,
        workPeriodDescription: dto.workPeriodDescription,
        metroStations: dto.metroStations
      },
      photos: dto.photos,
      contacts: dto.contacts,
      requirements: dto.requirements,
      responsibilities: dto.responsibilities,
      benefits: dto.benefits,
      vacancy: {
        companyName,
        position: dto.title,
        schedule: dto.schedule,
        experience: dto.experience,
        salaryFrom: dto.salaryFrom,
        salaryTo: dto.salaryTo,
        salaryPeriod: dto.salaryPeriod,
        salaryCurrency: 'RUB',
        isSalaryNegotiable: dto.isSalaryNegotiable
      }
    };

    const ad = await this.coreAdService.createAdForModeration(ownerId, createDto);
    void this.moderationNotificationService.notifyNewAd(ad, ownerId);

    return ad;
  }

  private async resolveCompanyName(ownerId: string, value: string): Promise<string> {
    const normalized = value.trim();

    if (normalized && normalized !== 'Работодатель' && normalized !== 'Работодатель Rabst24') {
      return normalized;
    }

    const user = await this.userService.getById(ownerId);
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

    return user.displayName || fullName || user.maxUsername || 'Работодатель';
  }
}
