import type { Request, Response } from 'express';
import { config } from '@rabst24/config';
import { pickPublicFeatureFlags } from '@rabst24/shared';
import { sendOk } from '../../shared/http/responses.js';

export class FeaturesController {
  list(_request: Request, response: Response): void {
    sendOk(response, {
      flags: pickPublicFeatureFlags(config.features)
    });
  }
}
