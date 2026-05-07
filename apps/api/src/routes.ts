import { Router } from 'express';
import { config } from '@rabst24/config';
import type { ApiContainer } from './app/container.js';
import { createAdsRouter } from './modules/ads/ads.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createBotIntegrationRouter } from './modules/bot-integration/bot-integration.routes.js';
import { createMaxWebhookRouter } from './modules/bot-integration/max-webhook.routes.js';
import { createChannelPublishingRouter } from './modules/channel-publishing/channel-publishing.routes.js';
import { createEquipmentRouter } from './modules/equipment/equipment.routes.js';
import { createFavoritesRouter } from './modules/favorites/favorites.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createModerationRouter } from './modules/moderation/moderation.routes.js';
import { createProfilesRouter } from './modules/profiles/profiles.routes.js';
import { createReferencesRouter } from './modules/references/references.routes.js';
import { createResumesRouter } from './modules/resumes/resumes.routes.js';
import { createReviewsRouter } from './modules/reviews/reviews.routes.js';
import { createUploadsRouter } from './modules/uploads/uploads.routes.js';
import { createUsersRouter } from './modules/users/users.routes.js';
import { createVacanciesRouter } from './modules/vacancies/vacancies.routes.js';

const API_MODULES = [
  'auth',
  'users',
  'profiles',
  'ads',
  'vacancies',
  'resumes',
  'equipment',
  'moderation',
  'favorites',
  'reviews',
  'references',
  'channel-publishing',
  'bot-integration',
  'uploads'
] as const;

export function createApiRouter(container: ApiContainer): Router {
  const rootRouter = Router();
  const v1Router = Router();

  rootRouter.use('/health', createHealthRouter());
  rootRouter.use(config.max.webhookPath, createMaxWebhookRouter(container.botUpdateRouter));

  v1Router.use('/health', createHealthRouter());
  v1Router.get('/meta', (_request, response) => {
    response.json({
      data: {
        version: 'v1',
        modules: API_MODULES
      }
    });
  });

  v1Router.use('/auth', createAuthRouter(container));
  v1Router.use('/users', createUsersRouter(container));
  v1Router.use('/profiles', createProfilesRouter(container));
  v1Router.use('/ads', createAdsRouter(container));
  v1Router.use('/vacancies', createVacanciesRouter(container));
  v1Router.use('/resumes', createResumesRouter(container));
  v1Router.use('/equipment', createEquipmentRouter(container));
  v1Router.use('/moderation', createModerationRouter(container));
  v1Router.use('/favorites', createFavoritesRouter(container));
  v1Router.use('/reviews', createReviewsRouter(container));
  v1Router.use('/references', createReferencesRouter());
  v1Router.use('/channel-publishing', createChannelPublishingRouter(container));
  v1Router.use('/bot-integration', createBotIntegrationRouter(container));
  v1Router.use('/uploads', createUploadsRouter(container));

  rootRouter.use('/api/v1', v1Router);
  rootRouter.use('/api', v1Router);

  return rootRouter;
}
