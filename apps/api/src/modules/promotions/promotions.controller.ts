import type { Request, Response } from 'express';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import type { PromotionsService } from './promotions.service.js';
import type { CreatePromotionPurchaseDto, UpdatePromotionProductDto } from './promotions.schemas.js';

export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  productsForAd = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const products = await this.promotionsService.listAvailableProductsForAd(userId, request.params.adId);

    sendOk(response, products);
  });

  purchasesForAd = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const purchases = await this.promotionsService.listPurchasesForAd(userId, request.params.adId);

    sendOk(response, purchases);
  });

  createPurchase = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const result = await this.promotionsService.createPurchase(
      userId,
      request.params.adId,
      request.body as CreatePromotionPurchaseDto
    );

    sendOk(response, result);
  });

  adminProducts = asyncHandler(async (_request: Request, response: Response): Promise<void> => {
    const products = await this.promotionsService.listAdminProducts();

    sendOk(response, products);
  });

  updateAdminProduct = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const product = await this.promotionsService.updateAdminProduct(
      request.params.type as never,
      userId,
      request.body as UpdatePromotionProductDto
    );

    sendOk(response, product);
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}
