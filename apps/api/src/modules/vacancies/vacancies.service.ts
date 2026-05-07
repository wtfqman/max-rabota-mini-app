import type { AdService as CoreAdService } from '@rabst24/core';
import {
  canonicalizeCategory,
  canonicalizeDistrict,
  type AdListQueryDto,
  type CreateAdDto
} from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { CreateVacancyDto } from './vacancies.schemas.js';
import type { VacanciesRepository } from './vacancies.repository.js';

export class VacanciesService extends FoundationService {
  constructor(
    repository: VacanciesRepository,
    private readonly coreAdService: CoreAdService
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
        companyName: dto.companyName,
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

    return this.coreAdService.createAdForModeration(ownerId, createDto);
  }
}
