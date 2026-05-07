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

  registerCorePlugins(app);
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'storage', 'uploads')));
  app.use(createApiRouter(container));

  if (hasBuiltWebApp) {
    app.use(express.static(webDistDir));
    app.get('*', (request, response, next) => {
      if (isBackendPath(request.path)) {
        return next();
      }

      response.sendFile(webIndexFile);
    });
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
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
