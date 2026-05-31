import { AdStatus, ModerationAction, type Ad } from '@rabst24/db';
import { AppError } from '@rabst24/shared';
import type { AdRepository } from '../ads/ad.repository.js';
import type { ModerationLogRepository } from './moderation-log.repository.js';

export class ModerationService {
  constructor(
    private readonly adRepository: AdRepository,
    private readonly moderationLogRepository: ModerationLogRepository
  ) {}

  async submitForModeration(adId: string): Promise<Ad> {
    const ad = await this.requireAd(adId);
    const updatedAd = await this.adRepository.updateStatus(adId, AdStatus.PENDING_MODERATION);

    await this.moderationLogRepository.create({
      adId,
      action: ModerationAction.SUBMITTED,
      statusFrom: ad.status,
      statusTo: AdStatus.PENDING_MODERATION
    });

    return updatedAd;
  }

  async approveAd(adId: string, moderatorId: string): Promise<Ad> {
    const ad = await this.requireAd(adId);
    const updatedAd = await this.adRepository.updateStatus(adId, AdStatus.APPROVED);

    await this.moderationLogRepository.create({
      adId,
      moderatorId,
      action: ModerationAction.APPROVED,
      statusFrom: ad.status,
      statusTo: AdStatus.APPROVED
    });

    return updatedAd;
  }

  async rejectAd(adId: string, moderatorId: string, reason: string): Promise<Ad> {
    const ad = await this.requireAd(adId);
    const updatedAd = await this.adRepository.updateStatus(adId, AdStatus.REJECTED);

    await this.moderationLogRepository.create({
      adId,
      moderatorId,
      action: ModerationAction.REJECTED,
      statusFrom: ad.status,
      statusTo: AdStatus.REJECTED,
      reason
    });

    return updatedAd;
  }

  async hideAd(adId: string, moderatorId: string, reason?: string): Promise<Ad> {
    const ad = await this.requireAd(adId);
    const updatedAd = await this.adRepository.updateStatus(adId, AdStatus.HIDDEN);

    await this.moderationLogRepository.create({
      adId,
      moderatorId,
      action: ModerationAction.HIDDEN,
      statusFrom: ad.status,
      statusTo: AdStatus.HIDDEN,
      reason
    });

    return updatedAd;
  }

  async unpublishAd(adId: string, moderatorId: string, reason?: string): Promise<Ad> {
    const ad = await this.requireAd(adId);
    const updatedAd = await this.adRepository.updateStatus(adId, AdStatus.HIDDEN);

    await this.moderationLogRepository.create({
      adId,
      moderatorId,
      action: ModerationAction.UNPUBLISHED,
      statusFrom: ad.status,
      statusTo: AdStatus.HIDDEN,
      reason
    });

    return updatedAd;
  }

  async archiveAd(adId: string, moderatorId: string, reason?: string): Promise<Ad> {
    const ad = await this.requireAd(adId);
    const updatedAd = await this.adRepository.updateStatus(adId, AdStatus.ARCHIVED);

    await this.moderationLogRepository.create({
      adId,
      moderatorId,
      action: ModerationAction.ARCHIVED,
      statusFrom: ad.status,
      statusTo: AdStatus.ARCHIVED,
      reason
    });

    return updatedAd;
  }

  async deleteAd(adId: string, moderatorId: string, reason?: string): Promise<Ad> {
    const ad = await this.requireAd(adId);
    const updatedAd = await this.adRepository.updateStatus(adId, AdStatus.DELETED);

    await this.moderationLogRepository.create({
      adId,
      moderatorId,
      action: ModerationAction.DELETED,
      statusFrom: ad.status,
      statusTo: AdStatus.DELETED,
      reason
    });

    return updatedAd;
  }

  async logChannelRemoved(adId: string, moderatorId: string, reason?: string): Promise<Ad> {
    const ad = await this.requireAd(adId);

    await this.moderationLogRepository.create({
      adId,
      moderatorId,
      action: ModerationAction.CHANNEL_REMOVED,
      statusFrom: ad.status,
      statusTo: ad.status,
      reason
    });

    return ad;
  }

  private async requireAd(adId: string): Promise<Ad> {
    const ad = await this.adRepository.findById(adId);

    if (!ad) {
      throw new AppError('Ad not found', 404, { adId });
    }

    return ad;
  }
}
