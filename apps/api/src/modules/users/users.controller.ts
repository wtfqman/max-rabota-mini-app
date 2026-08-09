import type { Request, Response } from 'express';
import { serializeAdCard } from '@rabst24/core';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { UsersService } from './users.service.js';

export class UsersController extends FoundationController {
  constructor(private readonly usersService: UsersService) {
    super(usersService);
  }

  me = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    request.log.info({ userId, auth: Boolean(request.auth) }, '[PROFILE] get user profile');
    const result = await this.usersService.getMe(userId);

    sendOk(response, serializeMe(result.user, result.stats, result.referral));
  });

  updateMe = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const user = await this.usersService.updateMe(userId, request.body as { displayName?: string });

    sendOk(response, {
      id: user.id,
      displayName: user.displayName,
      updatedAt: user.updatedAt.toISOString()
    });
  });

  team = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const users = await this.usersService.listTeamUsers(request.query as { q?: string; role?: 'user' | 'moderator' | 'admin' });

    sendOk(response, users.map(serializeTeamUser));
  });

  updateRole = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const actorId = this.requireUserId(request);
    const user = await this.usersService.updateUserRole(
      actorId,
      request.params.userId,
      request.body as { role: 'user' | 'moderator' | 'admin' }
    );

    sendOk(response, serializeRoleUpdate(user));
  });

  updateStatus = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const actorId = this.requireUserId(request);
    const result = await this.usersService.updateUserStatus(
      actorId,
      request.params.userId,
      request.body as { status: 'active' | 'blocked' }
    );

    sendOk(response, serializeStatusUpdate(result));
  });

  publicProfile = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.usersService.getPublicProfile(request.params.userId);
    sendOk(response, serializePublicProfile(result));
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}

function serializeRoleUpdate(user: Awaited<ReturnType<UsersService['updateUserRole']>>) {
  return {
    id: user.id,
    role: user.role.toLowerCase(),
    updatedAt: user.updatedAt.toISOString()
  };
}

function serializeStatusUpdate(result: Awaited<ReturnType<UsersService['updateUserStatus']>>) {
  const { user } = result;

  return {
    id: user.id,
    status: user.status.toLowerCase(),
    updatedAt: user.updatedAt.toISOString(),
    hiddenAdsTotal: result.hiddenAdIds.length,
    channelRemoval: result.channelRemoval
  };
}

function serializeTeamUser(user: Awaited<ReturnType<UsersService['listTeamUsers']>>[number]) {
  return {
    id: user.id,
    maxUserId: user.maxUserId.toString(),
    maxUsername: user.maxUsername,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    role: user.role.toLowerCase(),
    status: user.status.toLowerCase(),
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    adsTotal: user._count.ads
  };
}

function serializeMe(
  user: Awaited<ReturnType<UsersService['getMe']>>['user'],
  stats: Awaited<ReturnType<UsersService['getMe']>>['stats'],
  referral: Awaited<ReturnType<UsersService['getMe']>>['referral']
) {
  return {
    id: user.id,
    maxUserId: user.maxUserId.toString(),
    maxUsername: user.maxUsername,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    role: user.role.toLowerCase(),
    status: user.status.toLowerCase(),
    createdAt: user.createdAt.toISOString(),
    profile: user.profile
      ? {
          id: user.profile.id,
          city: user.profile.city,
          districtText: user.profile.districtText,
          about: user.profile.about,
          avatarUrl: user.profile.avatarUrl,
          profileType: user.profile.profileType.toLowerCase(),
          companyName: user.profile.companyName,
          phone: user.profile.phone,
          email: user.profile.email,
          website: user.profile.website,
          maxContact: user.profile.maxContact,
          specialization: user.profile.specialization,
          experience: user.profile.experience,
          companyInfo: user.profile.companyInfo,
          registrationDetails: user.profile.registrationDetails,
          privacy: {
            showPhone: user.profile.showPhone,
            showEmail: user.profile.showEmail,
            showWebsite: user.profile.showWebsite,
            showMaxContact: user.profile.showMaxContact,
            allowResumePublicProfile: user.profile.allowResumePublicProfile
          },
          createdAt: user.profile.createdAt.toISOString(),
          updatedAt: user.profile.updatedAt.toISOString()
        }
      : null,
    trustBadges: serializeTrustBadges(user.trustBadgeAssignments, user.createdAt),
    stats: {
      adsTotal: user._count.ads,
      favoritesTotal: user._count.favorites,
      reviewsTotal: user._count.reviewsReceived,
      adsByStatus: stats.byStatus,
      adsByType: stats.byType,
      vacancyPublicationBalance: stats.vacancyPublicationBalance
    },
    referral: {
      code: referral.code,
      inviteUrl: referral.inviteUrl,
      referredTotal: referral.referredTotal,
      rewardedTotal: referral.rewardedTotal,
      bonusPublications: referral.bonusPublications
    }
  };
}

export function serializePublicProfile(result: Awaited<ReturnType<UsersService['getPublicProfile']>>) {
  const { user, activeAds, adsTotal, reviews, reviewSummary } = result;
  const profile = user.profile;
  const activeVacancies = activeAds.filter((ad) => ad.type === 'VACANCY').map(serializeAdCard);
  const otherActiveAds = activeAds.filter((ad) => ad.type !== 'VACANCY').map(serializeAdCard);

  return {
    id: user.id,
    displayName: getPublicName(user),
    profileType: (profile?.profileType ?? 'PERSON').toLowerCase(),
    companyName: profile?.companyName ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    about: profile?.about ?? null,
    city: profile?.city ?? null,
    districtText: profile?.districtText ?? null,
    specialization: profile?.specialization ?? null,
    experience: profile?.experience ?? null,
    companyInfo: profile?.companyInfo ?? null,
    registeredAt: user.createdAt.toISOString(),
    stats: {
      publishedAdsTotal: adsTotal,
      reviewsTotal: reviewSummary._count._all,
      ratingAverage: reviewSummary._avg.rating ? Number(reviewSummary._avg.rating.toFixed(2)) : null
    },
    contacts: serializePublicContacts(user),
    privacy: {
      allowResumePublicProfile: profile?.allowResumePublicProfile ?? true
    },
    trustBadges: serializeTrustBadges(user.trustBadgeAssignments, user.createdAt),
    activeVacancies,
    otherActiveAds,
    reviews: reviews.map((review) => ({
      id: review.id,
      author: {
        id: review.author.id,
        displayName: getReviewAuthorName(review.author)
      },
      rating: review.rating,
      text: review.text,
      ad: review.ad
        ? {
            id: review.ad.id,
            title: review.ad.title,
            type: review.ad.type.toLowerCase()
          }
        : null,
      createdAt: review.createdAt.toISOString()
    }))
  };
}

function getPublicName(user: Awaited<ReturnType<UsersService['getPublicProfile']>>['user']): string {
  const profile = user.profile;

  if (profile?.profileType === 'COMPANY' && profile.companyName?.trim()) {
    return profile.companyName.trim();
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return user.displayName?.trim() || fullName || user.maxUsername || 'Профиль';
}

function serializePublicContacts(user: Awaited<ReturnType<UsersService['getPublicProfile']>>['user']) {
  const profile = user.profile;

  if (!profile) {
    return [];
  }

  return [
    profile.showPhone && profile.phone ? { type: 'phone', value: profile.phone } : null,
    profile.showEmail && profile.email ? { type: 'email', value: profile.email } : null,
    profile.showWebsite && profile.website ? { type: 'website', value: profile.website } : null,
    profile.showMaxContact && (profile.maxContact || user.maxUsername)
      ? { type: 'max', value: profile.maxContact || `@${user.maxUsername}` }
      : null
  ].filter((contact): contact is { type: string; value: string } => Boolean(contact));
}

function getReviewAuthorName(author: Awaited<ReturnType<UsersService['getPublicProfile']>>['reviews'][number]['author']): string | null {
  const fullName = [author.firstName, author.lastName].filter(Boolean).join(' ').trim();
  return author.displayName ?? (fullName || author.maxUsername);
}

function serializeTrustBadges(assignments: Array<{ badge: string }>, createdAt: Date): string[] {
  const badges = new Set(assignments.map((assignment) => assignment.badge.toLowerCase()));
  const memberAgeDays = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);

  if (memberAgeDays >= 365) {
    badges.add('long_time_member');
  }

  return Array.from(badges);
}
