import { Router, type RequestHandler } from 'express';
import { AppError } from '@rabst24/shared';
import type { ApiContainer } from '../../app/container.js';
import { optionalAuth, requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { AdAnalyticsController } from './ad-analytics.controller.js';
import {
  adAnalyticsAdParamSchema,
  adAnalyticsEventSchema,
  adAnalyticsRangeQuerySchema
} from './ad-analytics.schemas.js';

export function createAdAnalyticsRouter(container: ApiContainer): Router {
  const router = Router();
  const controller = new AdAnalyticsController(container.adAnalyticsService);
  const limiter = createAnalyticsRateLimiter();

  router.post('/events', optionalAuth, limiter, validateRequest({ body: adAnalyticsEventSchema }), controller.recordEvent);
  router.get(
    '/ads/:adId/owner',
    requireAuth,
    limiter,
    validateRequest({ params: adAnalyticsAdParamSchema, query: adAnalyticsRangeQuerySchema }),
    controller.ownerAd
  );
  router.get(
    '/admin',
    requireAuth,
    requireRole(['admin']),
    limiter,
    validateRequest({ query: adAnalyticsRangeQuerySchema }),
    controller.adminDashboard
  );

  return router;
}

function createAnalyticsRateLimiter(): RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const windowMs = 60_000;
  const limit = 120;

  return (request, _response, next) => {
    const now = Date.now();
    const key = request.auth?.userId ?? request.ip ?? 'anonymous';
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      next();
      return;
    }

    if (bucket.count >= limit) {
      next(new AppError('Too many analytics requests', 429, {
        code: 'ANALYTICS_RATE_LIMITED'
      }));
      return;
    }

    bucket.count += 1;
    next();
  };
}
