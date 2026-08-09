import type { Request, Response } from 'express';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import type { AdAnalyticsService } from './ad-analytics.service.js';
import type { AdAnalyticsEventDto, AdAnalyticsRangeQuery } from './ad-analytics.schemas.js';

export class AdAnalyticsController {
  constructor(private readonly service: AdAnalyticsService) {}

  recordEvent = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.service.recordEvent(request.body as AdAnalyticsEventDto, {
      userId: request.auth?.userId,
      role: request.auth?.role,
      userAgent: request.header('user-agent')
    });

    sendOk(response, result);
  });

  ownerAd = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.service.getOwnerDashboard(
      this.requireUserId(request),
      request.params.adId,
      (request.query as unknown as AdAnalyticsRangeQuery).days
    );

    sendOk(response, result);
  });

  adminDashboard = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.service.getAdminDashboard((request.query as unknown as AdAnalyticsRangeQuery).days);
    sendOk(response, result);
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}
