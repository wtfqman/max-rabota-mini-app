import type { Request, Response } from 'express';
import { ContactDisputeReason } from '@rabst24/db';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import type { VerifiedContactsService } from './verified-contacts.service.js';

export class VerifiedContactsController {
  constructor(private readonly service: VerifiedContactsService) {}

  verifyMiniApp = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const result = await this.service.verifyMiniAppContact(userId, request.body, {
      ip: request.ip
    });

    sendOk(response, result);
  });

  startBotFallback = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.service.sendBotContactRequest(this.requireUserId(request));
    sendOk(response, result);
  });

  mine = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    sendOk(response, await this.service.listMine(this.requireUserId(request)));
  });

  attachResume = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.service.attachToResume(this.requireUserId(request), request.body);
    sendOk(response, result);
  });

  getResumeContact = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const userId = this.requireUserId(request);
    const result = await this.service.getProtectedContact(request.params.resumeAdId, userId);

    response
      .setHeader('Cache-Control', 'no-store')
      .setHeader('Pragma', 'no-cache')
      .setHeader('Vary', 'Authorization');
    sendOk(response, result);
  });

  sendConnectionRequest = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const result = await this.service.sendConnectionRequest(request.params.resumeAdId, this.requireUserId(request));
    sendOk(response, result);
  });

  openDispute = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const reason = request.body.reason as ContactDisputeReason;
    const result = await this.service.openDispute({
      entitlementId: request.params.entitlementId,
      buyerUserId: this.requireUserId(request),
      reason,
      comment: request.body.comment
    });

    sendOk(response, {
      id: result.id,
      status: result.status.toLowerCase(),
      authorReverifyDeadline: result.authorReverifyDeadline?.toISOString() ?? null
    });
  });

  private requireUserId(request: Request): string {
    if (!request.auth?.userId) {
      throw new AppError('Authentication required', 401);
    }

    return request.auth.userId;
  }
}
