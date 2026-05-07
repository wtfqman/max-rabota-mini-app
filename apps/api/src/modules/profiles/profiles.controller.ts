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
    const profile = await this.profilesService.getMe(this.requireUserId(request));
    sendOk(response, serializeProfile(profile));
  });

  updateMe = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const profile = await this.profilesService.updateMe(this.requireUserId(request), request.body);
    sendOk(response, serializeProfile(profile));
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
    city: profile.city,
    districtText: profile.districtText,
    about: profile.about,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString()
  };
}
