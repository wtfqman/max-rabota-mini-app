import type { AdService as CoreAdService } from '@rabst24/core';
import { logger } from '@rabst24/config';
import { AdStatus } from '@rabst24/db';
import {
  canonicalizeCategory,
  canonicalizeDistrict,
  type AdListQueryDto,
  type CreateAdDto
} from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { ModerationNotificationService } from '../moderation/moderation-notification.service.js';
import type { NotificationService } from '../notifications/notifications.service.js';
import type { VerifiedContactsService } from '../verified-contacts/verified-contacts.service.js';
import type { CreateResumeDto } from './resumes.schemas.js';
import type { ResumesRepository } from './resumes.repository.js';

export class ResumesService extends FoundationService {
  constructor(
    repository: ResumesRepository,
    private readonly coreAdService: CoreAdService,
    private readonly moderationNotificationService: ModerationNotificationService,
    private readonly notificationService?: NotificationService,
    private readonly verifiedContactsService?: VerifiedContactsService
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
        address: dto.address
      },
      photos: dto.photos,
      contacts: dto.contacts,
      requirements: [],
      responsibilities: [],
      benefits: [],
      resume: {
        desiredPosition: dto.profession,
        profession: dto.profession,
        expectedSalary: dto.expectedSalary,
        salaryCurrency: 'RUB',
        skills: []
      }
    };

    const ad = await this.coreAdService.createAdForModeration(ownerId, createDto, {
      initialStatus: AdStatus.PENDING_MODERATION
    });

    if (dto.verifiedContactId && dto.contactConsentId) {
      await this.verifiedContactsService?.attachToResume(ownerId, {
        resumeAdId: ad.id,
        verifiedContactId: dto.verifiedContactId,
        consentId: dto.contactConsentId
      });
    }

    logger.info(
      {
        ownerId,
        adId: ad.id,
        expectedSalaryProvided: dto.expectedSalary !== undefined,
        paymentRequired: false
      },
      '[RESUME_CREATE] created'
    );

    void this.moderationNotificationService.notifyNewAd(ad, ownerId);
    await this.notifyResumeCreated(ownerId, ad.id, ad.title);

    return { ad, payment: null };
  }

  private async notifyResumeCreated(ownerId: string, adId: string, title: string): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    await this.notificationService.notify({
      userId: ownerId,
      type: 'AD_CREATED',
      title: 'Объявление создано',
      body: `Резюме «${title}» сохранено.`,
      category: 'ad_status',
      idempotencyKey: `ad:${adId}:created`,
      deepLink: this.notificationService.buildMyAdsLink(),
      payload: {
        adId,
        type: 'resume'
      }
    });

    await this.notificationService.notify({
      userId: ownerId,
      type: 'AD_SUBMITTED_MODERATION',
      title: 'Отправлено на модерацию',
      body: `Резюме «${title}» отправлено на проверку.`,
      category: 'ad_status',
      critical: true,
      idempotencyKey: `ad:${adId}:submitted`,
      deepLink: this.notificationService.buildMyAdsLink(),
      payload: {
        adId,
        type: 'resume'
      }
    });
  }
}
