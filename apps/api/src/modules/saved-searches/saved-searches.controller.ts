import type { Request, Response } from 'express';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendCreated, sendNoContent, sendOk } from '../../shared/http/responses.js';
import type { SavedSearchesService } from './saved-searches.service.js';

export class SavedSearchesController {
  constructor(private readonly service: SavedSearchesService) {}

  list = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const items = await this.service.list(userId, request.query as never);
    sendOk(response, items);
  });

  create = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const savedSearch = await this.service.create(userId, request.body);
    sendCreated(response, savedSearch);
  });

  update = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const savedSearch = await this.service.update(userId, request.params.savedSearchId, request.body);
    sendOk(response, savedSearch);
  });

  delete = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    await this.service.delete(userId, request.params.savedSearchId);
    sendNoContent(response);
  });

  results = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const result = await this.service.getResults(userId, request.params.savedSearchId, request.query as never);
    sendOk(response, result.items, {
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / result.perPage)
    });
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}
