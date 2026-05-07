import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import type { ReferenceSuggestQuery } from './references.schemas.js';
import type { ReferencesService } from './references.service.js';

export class ReferencesController extends FoundationController {
  constructor(private readonly referencesService: ReferencesService) {
    super(referencesService);
  }

  categories = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const query = request.query as unknown as ReferenceSuggestQuery;
    sendOk(response, this.referencesService.categories(query.q));
  });

  districts = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const query = request.query as unknown as ReferenceSuggestQuery;
    sendOk(response, this.referencesService.districts(query.q));
  });
}
