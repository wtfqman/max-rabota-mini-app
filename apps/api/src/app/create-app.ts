import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Express } from 'express';
import { createApiRouter } from '../routes.js';
import { registerCorePlugins } from '../plugins/core-plugins.js';
import { notFoundMiddleware } from '../middlewares/not-found.middleware.js';
import { errorMiddleware } from '../middlewares/error.middleware.js';
import type { ApiContainer } from './container.js';

export function createApp(container: ApiContainer): Express {
  const app = express();
  const webDistDir = path.resolve(process.cwd(), 'dist', 'apps', 'web');
  const webIndexFile = path.join(webDistDir, 'index.html');
  const hasBuiltWebApp = fs.existsSync(webIndexFile);
  const uploadsDir = path.resolve(process.cwd(), 'storage', 'uploads');
  const legacyUploadsDir = path.resolve(process.cwd(), 'uploads');

  registerCorePlugins(app);
  app.use(rewriteRootApiRequest);
  app.use('/uploads', express.static(uploadsDir));
  app.use('/uploads', express.static(legacyUploadsDir));
  app.use(createApiRouter(container));

  if (hasBuiltWebApp) {
    app.use(express.static(webDistDir, { setHeaders: setStaticCacheHeaders }));
    app.get('*', (request, response, next) => {
      if (isBackendPath(request.path)) {
        return next();
      }

      setNoStoreHeaders(response);
      response.sendFile(webIndexFile);
    });
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

function setStaticCacheHeaders(response: express.Response, filePath: string): void {
  if (filePath.endsWith('.html')) {
    setNoStoreHeaders(response);
    return;
  }

  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}

function setNoStoreHeaders(response: express.Response): void {
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
}

const ROOT_API_SEGMENTS = new Set([
  'auth',
  'users',
  'profiles',
  'ads',
  'vacancies',
  'resumes',
  'equipment',
  'materials',
  'tools',
  'moderation',
  'favorites',
  'reviews',
  'references',
  'channel-publishing',
  'bot-integration'
]);

function rewriteRootApiRequest(
  request: express.Request,
  _response: express.Response,
  next: express.NextFunction
): void {
  const firstSegment = request.path.split('/').filter(Boolean)[0];

  if (!firstSegment || !ROOT_API_SEGMENTS.has(firstSegment) || !isApiLikeRequest(request)) {
    next();
    return;
  }

  request.url = `/api${request.url}`;
  next();
}

function isApiLikeRequest(request: express.Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return true;
  }

  if (request.get('sec-fetch-dest') === 'empty') {
    return true;
  }

  const accept = request.get('accept') ?? '';
  return !accept.includes('text/html');
}

function isBackendPath(pathname: string): boolean {
  return (
    pathname === '/health' ||
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/uploads/') ||
    pathname.startsWith('/webhooks/')
  );
}
