import type { Request, Response } from 'express';
import { serializeAdDetail, serializeAdListMeta } from '@rabst24/core';
import { AppError, type RejectAdDto } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { ModerationQueueQuery } from './moderation.schemas.js';
import type { ModerationModuleService } from './moderation.service.js';

export class ModerationController extends FoundationController {
  constructor(private readonly moderationService: ModerationModuleService) {
    super(moderationService);
  }

  queue = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.moderationService.listQueue(request.query as unknown as ModerationQueueQuery);
    sendOk(response, result.items.map(serializeAdDetail), serializeAdListMeta(result));
  });

  preview = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ad = await this.moderationService.getPreview(request.params.adId);
    sendOk(response, serializeAdDetail(ad));
  });

  approve = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireModeratorId(request);
    const result = await this.moderationService.approve(request.params.adId, moderatorId);

    sendOk(response, {
      ad: serializeAdDetail(result.ad),
      publication: result.publication
    });
  });

  reject = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireModeratorId(request);
    const result = await this.moderationService.reject(
      request.params.adId,
      moderatorId,
      (request.body as RejectAdDto).reason
    );

    sendOk(response, {
      ad: serializeAdDetail(result.ad)
    });
  });

  hide = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const moderatorId = this.requireModeratorId(request);
    const result = await this.moderationService.hide(
      request.params.adId,
      moderatorId,
      (request.body as { reason?: string }).reason
    );

    sendOk(response, {
      ad: serializeAdDetail(result.ad)
    });
  });

  logs = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const query = request.query as unknown as { page: number; perPage: number; adId?: string };
    const result = await this.moderationService.listLogs(query);

    sendOk(response, result.items, {
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / result.perPage)
    });
  });

  private requireModeratorId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}
