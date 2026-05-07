import type { Request, Response } from 'express';
import { serializeAdCard, serializeAdDetail, serializeAdListMeta } from '@rabst24/core';
import type { AdListQueryDto } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendCreated, sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { CreateResumeDto } from './resumes.schemas.js';
import type { ResumesService } from './resumes.service.js';

export class ResumesController extends FoundationController {
  constructor(private readonly resumesService: ResumesService) {
    super(resumesService);
  }

  list = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.resumesService.listPublic(request.query as unknown as AdListQueryDto);
    sendOk(response, result.items.map(serializeAdCard), serializeAdListMeta(result));
  });

  details = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ad = await this.resumesService.getPublicDetails(request.params.adId);
    sendOk(response, serializeAdDetail(ad));
  });

  create = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ownerId = request.auth?.userId;

    if (!ownerId) {
      response.status(401).json({
        error: {
          message: 'Authentication required'
        }
      });
      return;
    }

    const ad = await this.resumesService.createForModeration(ownerId, request.body as CreateResumeDto);

    sendCreated(response, {
      id: ad.id,
      type: ad.type.toLowerCase(),
      status: ad.status.toLowerCase(),
      title: ad.title,
      createdAt: ad.createdAt.toISOString()
    });
  });
}
