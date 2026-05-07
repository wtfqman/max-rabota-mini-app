import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';

export class HealthController {
  liveness = asyncHandler(async (_request: Request, response: Response): Promise<void> => {
    sendOk(response, {
      status: 'ok',
      service: 'rabst24-api',
      timestamp: new Date().toISOString()
    });
  });
}
