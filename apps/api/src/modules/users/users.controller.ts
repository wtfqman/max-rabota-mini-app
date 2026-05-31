import type { Request, Response } from 'express';
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
    const result = await this.usersService.getMe(userId);

    sendOk(response, serializeMe(result.user, result.stats));
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
  stats: Awaited<ReturnType<UsersService['getMe']>>['stats']
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
          createdAt: user.profile.createdAt.toISOString(),
          updatedAt: user.profile.updatedAt.toISOString()
        }
      : null,
    stats: {
      adsTotal: user._count.ads,
      favoritesTotal: user._count.favorites,
      reviewsTotal: user._count.reviewsReceived,
      adsByStatus: stats.byStatus,
      adsByType: stats.byType
    }
  };
}
