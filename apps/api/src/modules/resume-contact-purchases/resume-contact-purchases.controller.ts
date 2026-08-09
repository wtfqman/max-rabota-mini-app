import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import type { ResumeContactPurchasesService } from './resume-contact-purchases.service.js';

export class ResumeContactPurchasesController {
  constructor(private readonly service: ResumeContactPurchasesService) {}

  status = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const access = await this.service.getAccess(request.params.resumeAdId, request.auth ?? null);
    sendOk(response, access);
  });

  create = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const buyerUserId = request.auth?.userId;

    if (!buyerUserId) {
      response.status(401).json({
        error: {
          message: 'Authentication required'
        }
      });
      return;
    }

    const result = await this.service.createPurchase(buyerUserId, request.params.resumeAdId);
    sendOk(response, result);
  });
}
