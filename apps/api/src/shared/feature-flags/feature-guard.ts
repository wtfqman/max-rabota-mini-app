import type { RequestHandler } from 'express';
import { config } from '@rabst24/config';
import { AppError, type FeatureFlagKey, type FeatureFlags } from '@rabst24/shared';

export function requireFeature(
  feature: FeatureFlagKey,
  flags: FeatureFlags = config.features
): RequestHandler {
  return (_request, _response, next) => {
    if (!flags[feature]) {
      next(
        new AppError('Feature is disabled', 404, {
          code: 'FEATURE_DISABLED',
          feature
        })
      );
      return;
    }

    next();
  };
}
