import type { Request, Response } from 'express';
import { getAdPublicationSettings, serializeAdCard, serializeAdDetail, serializeAdListMeta } from '@rabst24/core';
import { AppError, type AdListQueryDto } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { AdsService } from './ads.service.js';
import type { OwnedAdsQuery, PublicationSettingsDto, UpdateOwnedAdDto } from './ads.schemas.js';

export class AdsController extends FoundationController {
  constructor(private readonly adsService: AdsService) {
    super(adsService);
  }

  list = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adsService.listPublic(request.query as unknown as AdListQueryDto);
    sendOk(response, result.items.map(serializeAdCard), serializeAdListMeta(result));
  });

  details = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ad = await this.adsService.getPublicDetails(request.params.adId);
    sendOk(response, serializeAdDetail(ad));
  });

  my = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ownerId = this.requireUserId(request);
    const result = await this.adsService.listMy(ownerId, request.query as unknown as OwnedAdsQuery);

    sendOk(
      response,
      result.items.map((ad) => ({
        ...serializeAdCard(ad),
        description: ad.description,
        status: ad.status.toLowerCase(),
        updatedAt: ad.updatedAt.toISOString(),
        moderationReason: getLatestModerationReason(ad),
        publicationSettings: getPublicationSettingsPayload(ad)
      })),
      serializeAdListMeta(result)
    );
  });

  updateMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ad = await this.adsService.updateMine(
      this.requireUserId(request),
      request.params.adId,
      request.body as UpdateOwnedAdDto
    );

    sendOk(response, serializeAdDetail(ad));
  });

  updatePublicationSettings = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ad = await this.adsService.updatePublicationSettings(
      this.requireUserId(request),
      request.params.adId,
      request.body as PublicationSettingsDto
    );

    sendOk(response, {
      ad: serializeAdDetail(ad),
      publicationSettings: getPublicationSettingsPayload(ad)
    });
  });

  hideMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adsService.hideMine(this.requireUserId(request), request.params.adId);
    sendOk(response, {
      ad: serializeAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  archiveMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adsService.archiveMine(this.requireUserId(request), request.params.adId);
    sendOk(response, {
      ad: serializeAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  deleteMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.adsService.deleteMine(this.requireUserId(request), request.params.adId);
    sendOk(response, {
      ad: serializeAdDetail(result.ad),
      channelRemoval: result.channelRemoval
    });
  });

  resubmitMine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const ad = await this.adsService.resubmitMine(this.requireUserId(request), request.params.adId);
    sendOk(response, serializeAdDetail(ad));
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}

function getLatestModerationReason(ad: Parameters<typeof serializeAdDetail>[0]): string | null {
  const latest = [...ad.moderationLogs]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .find((log) => log.reason);

  return latest?.reason ?? null;
}

function getPublicationSettingsPayload(ad: Parameters<typeof serializeAdDetail>[0]) {
  const settings = getAdPublicationSettings(ad.metadataJson);

  return settings ? { adId: ad.id, ...settings } : null;
}
