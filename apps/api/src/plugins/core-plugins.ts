import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config, logger } from '@rabst24/config';
import { requestIdMiddleware } from '../middlewares/request-id.middleware.js';

export function registerCorePlugins(app: Express): void {
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(requestIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'media-src': ["'self'", 'data:', 'blob:'],
          'script-src': ["'self'", 'https://st.max.ru'],
          'frame-ancestors': ["'self'", 'https://max.ru', 'https://*.max.ru'],
          'upgrade-insecure-requests': config.httpsEnabled ? [] : null
        }
      },
      frameguard: false,
      hsts: config.httpsEnabled
    })
  );
  app.use(
    cors({
      origin: config.isProduction ? validateProductionOrigin : true,
      credentials: true
    })
  );
  app.use(express.json({ limit: '100mb' }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (request) => request.id,
      autoLogging: {
        ignore: (request) =>
          request.url === '/health' ||
          request.url === '/api/health' ||
          request.url === '/api/v1/health'
      }
    })
  );
}

function validateProductionOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void
): void {
  if (!origin || config.corsOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('CORS origin is not allowed'), false);
}
