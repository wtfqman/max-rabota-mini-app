import type { Request, Response } from 'express';
import { AppError } from '@rabst24/shared';
import { asyncHandler } from '../http/async-handler.js';
import { sendOk } from '../http/responses.js';
import type { FoundationService } from './module-status.js';

export class FoundationController {
  constructor(private readonly service: FoundationService) {}

  status = asyncHandler(async (_request: Request, response: Response): Promise<void> => {
    sendOk(response, this.service.getStatus());
  });

  reserved = asyncHandler(async (): Promise<void> => {
    throw new AppError('Endpoint is reserved for implementation', 501, {
      module: this.service.getModuleName()
    });
  });
}
