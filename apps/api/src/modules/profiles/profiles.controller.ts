import type { Request, Response } from 'express';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { ProfilesService } from './profiles.service.js';

export class ProfilesController extends FoundationController {
  constructor(private readonly profilesService: ProfilesService) {
    super(profilesService);
  }

  me = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    request.log.info({ userId, auth: Boolean(request.auth) }, '[PROFILE] get me');
    const profile = await this.profilesService.getMe(userId);
    sendOk(response, serializeProfile(profile));
  });

  updateMe = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    request.log.info({ userId, auth: Boolean(request.auth) }, '[PROFILE] update me');
    const profile = await this.profilesService.updateMe(userId, request.body);
    sendOk(response, serializeProfile(profile));
  });

  listTrustBadges = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const user = await this.profilesService.listTrustBadges(request.params.userId);
    sendOk(response, serializeTrustBadgeAdmin(user));
  });

  updateTrustBadge = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireUserId(request);
    const result = await this.profilesService.updateTrustBadge(
      request.params.userId,
      moderatorId,
      request.params.badge as 'phone_confirmed' | 'company_verified' | 'reliable_employer' | 'long_time_member',
      request.body as { enabled: boolean; reason?: string | null }
    );

    sendOk(response, serializeTrustBadgeAdmin(result));
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}

function serializeProfile(profile: Awaited<ReturnType<ProfilesService['getMe']>>) {
  return {
    id: profile.id,
    profileType: profile.profileType.toLowerCase(),
    companyName: profile.companyName,
    city: profile.city,
    districtText: profile.districtText,
    about: profile.about,
    avatarUrl: profile.avatarUrl,
    phone: profile.phone,
    email: profile.email,
    website: profile.website,
    maxContact: profile.maxContact,
    specialization: profile.specialization,
    experience: profile.experience,
    companyInfo: profile.companyInfo,
    registrationDetails: profile.registrationDetails,
    privacy: {
      showPhone: profile.showPhone,
      showEmail: profile.showEmail,
      showWebsite: profile.showWebsite,
      showMaxContact: profile.showMaxContact,
      allowResumePublicProfile: profile.allowResumePublicProfile
    },
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString()
  };
}

function serializeTrustBadgeAdmin(user: Awaited<ReturnType<ProfilesService['listTrustBadges']>>) {
  return {
    userId: user.id,
    badges: user.trustBadgeAssignments.map((assignment) => ({
      badge: assignment.badge.toLowerCase(),
      reason: assignment.reason,
      assignedBy: assignment.assignedBy
        ? {
            id: assignment.assignedBy.id,
            displayName: assignment.assignedBy.displayName,
            maxUsername: assignment.assignedBy.maxUsername
          }
        : null,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString()
    })),
    history: user.trustBadgeHistory.map((entry) => ({
      id: entry.id,
      badge: entry.badge.toLowerCase(),
      action: entry.action,
      reason: entry.reason,
      moderator: entry.moderator
        ? {
            id: entry.moderator.id,
            displayName: entry.moderator.displayName,
            maxUsername: entry.moderator.maxUsername
          }
        : null,
      createdAt: entry.createdAt.toISOString()
    }))
  };
}
