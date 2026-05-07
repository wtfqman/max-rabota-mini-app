import type { Request, Response } from 'express';
import { FoundationController } from '../../shared/modules/foundation.controller.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendOk } from '../../shared/http/responses.js';
import type { AuthService } from './auth.service.js';
import type { VerifyMaxLaunchDto } from './auth.types.js';

export class AuthController extends FoundationController {
  constructor(private readonly authService: AuthService) {
    super(authService);
  }

  verifyMaxLaunch = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    const body = request.body as Partial<VerifyMaxLaunchDto>;
    request.log.info(
      {
        platform: body.platform,
        initDataPreview: typeof body.initData === 'string' ? body.initData.slice(0, 500) : null
      },
      'Received MAX init data'
    );

    const payload = await this.authService.verifyMaxLaunch(request.body as VerifyMaxLaunchDto);
    sendOk(response, payload);
  });

  createDevSession = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    request.log.warn('Created local development auth session');
    const payload = await this.authService.createDevSession();
    sendOk(response, payload);
  });
}
