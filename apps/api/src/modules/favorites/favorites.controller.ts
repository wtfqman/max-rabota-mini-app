import type { Request, Response } from 'express';
import { serializeAdCard } from '@rabst24/core';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendNoContent, sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { FavoritesService } from './favorites.service.js';

export class FavoritesController extends FoundationController {
  constructor(private readonly favoritesService: FavoritesService) {
    super(favoritesService);
  }

  list = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const items = await this.favoritesService.list(this.requireUserId(request));

    sendOk(response, items.map((item) => ({
      favoriteId: item.id,
      addedAt: item.createdAt.toISOString(),
      ad: serializeAdCard(item.ad)
    })));
  });

  add = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const favorite = await this.favoritesService.add(this.requireUserId(request), request.params.adId);
    sendOk(response, {
      id: favorite.id,
      adId: favorite.adId,
      createdAt: favorite.createdAt.toISOString()
    });
  });

  remove = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    await this.favoritesService.remove(this.requireUserId(request), request.params.adId);
    sendNoContent(response);
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}
