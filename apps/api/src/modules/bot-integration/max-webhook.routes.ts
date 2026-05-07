import { Router } from 'express';
import { config, logger } from '@rabst24/config';
import type { BotUpdateRouter } from '@rabst24/bot-core';
import type { MaxUpdate } from '@rabst24/max-api';

export function createMaxWebhookRouter(updateRouter: BotUpdateRouter): Router {
  const router = Router();

  router.post('/', async (request, response, next) => {
    try {
      if (config.max.webhookSecret) {
        const receivedSecret = request.header('X-Max-Bot-Api-Secret');

        if (receivedSecret !== config.max.webhookSecret) {
          logger.warn('Rejected MAX webhook request with invalid secret');
          response.status(403).json({
            error: {
              message: 'Forbidden'
            }
          });
          return;
        }
      }

      await updateRouter.route(request.body as MaxUpdate);
      response.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
