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
    const initDataSummary = summarizeInitData(body.initData);

    request.log.info({ platform: body.platform, ...initDataSummary }, '[MAX_AUTH] received init data');

    try {
      const payload = await this.authService.verifyMaxLaunch(request.body as VerifyMaxLaunchDto);
      request.log.info(
        {
          platform: payload.launch.platform,
          userId: payload.user.id,
          startParam: payload.launch.startParam ?? null,
          authDate: payload.launch.authDate
        },
        '[MAX_AUTH] verified'
      );

      sendOk(response, payload);
    } catch (error) {
      request.log.warn(
        {
          platform: body.platform,
          ...initDataSummary,
          error: error instanceof Error ? error.message : 'Unknown MAX auth error'
        },
        '[MAX_AUTH] verification failed'
      );
      throw error;
    }
  });

  createDevSession = asyncHandler(async (request: Request, response: Response): Promise<void> => {
    request.log.warn('Created local development auth session');
    const payload = await this.authService.createDevSession();
    sendOk(response, payload);
  });
}

function summarizeInitData(initData: unknown) {
  if (typeof initData !== 'string') {
    return {
      initDataLength: 0,
      hasHash: false,
      hasAuthDate: false,
      hasUser: false,
      startParam: null
    };
  }

  const params = parseInitDataSummaryParams(initData);

  return {
    initDataLength: initData.length,
    hasHash: params.has('hash'),
    hasAuthDate: params.has('auth_date'),
    hasUser: params.has('user'),
    startParam: params.get('start_param') ?? params.get('startapp') ?? null
  };
}

function parseInitDataSummaryParams(raw: string): URLSearchParams {
  const candidates = [raw, safeDecode(raw)];

  for (const candidate of candidates) {
    const trimmed = candidate.trim().replace(/^[?#]/, '');
    const topLevel = new URLSearchParams(trimmed);

    if (topLevel.has('hash')) {
      return topLevel;
    }

    for (const key of ['WebAppData', 'webAppData', 'maxWebAppData', 'initData', 'appData']) {
      const nested = topLevel.get(key);

      if (!nested) {
        continue;
      }

      const nestedParams = new URLSearchParams(safeDecode(nested).replace(/^[?#]/, ''));

      if (nestedParams.has('hash')) {
        return nestedParams;
      }
    }
  }

  return new URLSearchParams(raw.trim().replace(/^[?#]/, ''));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
