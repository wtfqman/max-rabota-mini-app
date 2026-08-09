import { config, logger } from '@rabst24/config';
import type { ChannelPublishingService } from '@rabst24/core';
import { UserStatus } from '@rabst24/db';
import { AppError } from '@rabst24/shared';
import { FoundationService } from '../../shared/modules/module-status.js';
import type { AdPaymentService } from '../payments/ad-payment.service.js';
import { mapRole, mapStatus, type TeamUserQuery, type UsersRepository } from './users.repository.js';

type ChannelRemovalSummary = Awaited<ReturnType<ChannelPublishingService['removeAdPublications']>>;

export class UsersService extends FoundationService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly channelPublishingService?: Pick<ChannelPublishingService, 'removeAdPublications'>,
    private readonly adPaymentService?: Pick<AdPaymentService, 'getVacancyPublicationBalance'>
  ) {
    super(usersRepository);
  }

  async getMe(userId: string) {
    const user = await this.usersRepository.findMe(userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const [stats, vacancyPublicationBalance, referral] = await Promise.all([
      this.usersRepository.getAdStats(userId),
      this.adPaymentService?.getVacancyPublicationBalance(userId) ??
        Promise.resolve({ purchased: 0, bonus: 0, used: 0, remaining: 0 }),
      this.usersRepository.getReferralStats(userId)
    ]);

    return {
      user,
      stats: {
        ...stats,
        vacancyPublicationBalance
      },
      referral: {
        ...referral,
        inviteUrl: buildReferralInviteUrl(referral.code)
      }
    };
  }

  async updateMe(userId: string, dto: { displayName?: string }) {
    return this.usersRepository.updateMe(userId, dto);
  }

  async getPublicProfile(userId: string) {
    const profile = await this.usersRepository.findPublicProfile(userId);

    if (!profile) {
      throw new AppError('User profile not found', 404);
    }

    return profile;
  }

  async listTeamUsers(query: TeamUserQuery) {
    return this.usersRepository.listTeamUsers(query);
  }

  async updateUserRole(actorId: string, targetUserId: string, dto: { role: 'user' | 'moderator' | 'admin' }) {
    const role = mapRole(dto.role);
    const result = await this.usersRepository.updateUserRole(actorId, targetUserId, role);

    logger.info(
      {
        actorId,
        targetUserId,
        previousRole: result.previousRole.toLowerCase(),
        nextRole: result.user.role.toLowerCase()
      },
      'User role changed'
    );

    return result.user;
  }

  async updateUserStatus(actorId: string, targetUserId: string, dto: { status: 'active' | 'blocked' }) {
    const status = mapStatus(dto.status);
    const result = await this.usersRepository.updateUserStatus(actorId, targetUserId, status);
    const channelRemoval =
      status === UserStatus.BLOCKED ? await this.removeBlockedAdsFromChannel(result.hiddenAdIds) : null;

    logger.info(
      {
        actorId,
        targetUserId,
        previousStatus: result.previousStatus.toLowerCase(),
        nextStatus: result.user.status.toLowerCase(),
        hiddenAdsTotal: result.hiddenAdIds.length,
        channelRemoval
      },
      'User status changed'
    );

    return {
      user: result.user,
      hiddenAdIds: result.hiddenAdIds,
      channelRemoval
    };
  }

  private async removeBlockedAdsFromChannel(adIds: string[]): Promise<ChannelRemovalSummary | null> {
    if (!this.channelPublishingService || adIds.length === 0) {
      return null;
    }

    const summary: ChannelRemovalSummary = {
      attempted: 0,
      removed: 0,
      failed: 0,
      skipped: 0
    };

    for (const adId of adIds) {
      try {
        const result = await this.channelPublishingService.removeAdPublications(adId);
        summary.attempted += result.attempted;
        summary.removed += result.removed;
        summary.failed += result.failed;
        summary.skipped += result.skipped;
      } catch (error) {
        summary.failed += 1;
        logger.warn({ err: error, adId }, 'Unable to remove blocked user ad publications');
      }
    }

    return summary;
  }
}

function buildReferralInviteUrl(code: string): string {
  const baseUrl = config.max.miniAppWebApp?.trim() || config.miniAppUrl;

  try {
    const url = new URL(baseUrl);

    if (url.hostname.endsWith('max.ru') && (url.searchParams.has('startapp') || url.href.includes('startapp'))) {
      url.searchParams.set('startapp', code);
    } else {
      url.searchParams.set('start_param', code);
    }

    return url.toString();
  } catch {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}start_param=${encodeURIComponent(code)}`;
  }
}
