import type { Request, Response } from 'express';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import type { NotificationService } from './notifications.service.js';

export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  list = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const result = await this.notificationService.listForUser(userId, request.query as never);
    sendOk(response, result.items, {
      unreadTotal: result.unreadTotal,
      nextCursor: result.nextCursor
    });
  });

  markRead = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const notification = await this.notificationService.markRead(userId, request.params.notificationId);
    sendOk(response, notification);
  });

  markAllRead = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const result = await this.notificationService.markAllRead(userId);
    sendOk(response, result);
  });

  getPreferences = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const preferences = await this.notificationService.getPreferences(userId);
    sendOk(response, preferences);
  });

  updatePreferences = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const preferences = await this.notificationService.updatePreferences(userId, request.body);
    sendOk(response, preferences);
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}
