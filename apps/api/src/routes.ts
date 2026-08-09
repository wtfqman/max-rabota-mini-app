import { Router } from 'express';
import { config } from '@rabst24/config';
import type { ApiContainer } from './app/container.js';
import { createAdAnalyticsRouter } from './modules/ad-analytics/ad-analytics.routes.js';
import { createAdReportsRouter } from './modules/ad-reports/ad-reports.routes.js';
import { createAdsRouter } from './modules/ads/ads.routes.js';
import { createApplicationsRouter } from './modules/applications/applications.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createBotIntegrationRouter } from './modules/bot-integration/bot-integration.routes.js';
import { createMaxWebhookRouter } from './modules/bot-integration/max-webhook.routes.js';
import { createChannelPublishingRouter } from './modules/channel-publishing/channel-publishing.routes.js';
import { createEquipmentRouter } from './modules/equipment/equipment.routes.js';
import { createFavoritesRouter } from './modules/favorites/favorites.routes.js';
import { createFeaturesRouter } from './modules/features/features.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createModerationRouter } from './modules/moderation/moderation.routes.js';
import { createNotificationsRouter } from './modules/notifications/notifications.routes.js';
import { createPaymentsRouter, createYooKassaWebhookRouter } from './modules/payments/payments.routes.js';
import { createProfilesRouter } from './modules/profiles/profiles.routes.js';
import { createPromotionsRouter } from './modules/promotions/promotions.routes.js';
import { createReferencesRouter } from './modules/references/references.routes.js';
import { createResumesRouter } from './modules/resumes/resumes.routes.js';
import { createReviewsRouter } from './modules/reviews/reviews.routes.js';
import { createReservedFeatureRouter } from './modules/reserved-feature/reserved-feature.routes.js';
import { createResumeContactPurchasesRouter } from './modules/resume-contact-purchases/resume-contact-purchases.routes.js';
import { createSavedSearchesRouter } from './modules/saved-searches/saved-searches.routes.js';
import { createTelegramSyncRouter } from './modules/telegram-sync/telegram-sync.routes.js';
import { createMaterialsRouter, createToolsRouter } from './modules/trade/trade.routes.js';
import { createUploadsRouter } from './modules/uploads/uploads.routes.js';
import { createUsersRouter } from './modules/users/users.routes.js';
import { createVacanciesRouter } from './modules/vacancies/vacancies.routes.js';
import { createVerifiedContactsRouter } from './modules/verified-contacts/verified-contacts.routes.js';

const API_MODULES = [
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
  'payments',
  'notifications',
  'applications',
  'ad-analytics',
  'ad-reports',
  'features',
  'favorites',
  'reviews',
  'references',
  'verified-contacts',
  'channel-publishing',
  'bot-integration',
  'uploads'
] as const;

export function createApiRouter(container: ApiContainer): Router {
  const rootRouter = Router();
  const v1Router = Router();

  rootRouter.use('/health', createHealthRouter());
  rootRouter.use(config.max.webhookPath, createMaxWebhookRouter(container.botUpdateRouter));
  rootRouter.use(config.yookassa.webhookPath, createYooKassaWebhookRouter(container));

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
  v1Router.use('/features', createFeaturesRouter());
  v1Router.use('/users', createUsersRouter(container));
  v1Router.use('/profiles', createProfilesRouter(container));
  v1Router.use('/ads', createAdsRouter(container));
  v1Router.use('/vacancies', createVacanciesRouter(container));
  v1Router.use('/resumes', createResumesRouter(container));
  v1Router.use('/equipment', createEquipmentRouter(container));
  v1Router.use('/materials', createMaterialsRouter(container));
  v1Router.use('/tools', createToolsRouter(container));
  v1Router.use('/moderation', createModerationRouter(container));
  v1Router.use('/payments', createPaymentsRouter(container));
  v1Router.use('/favorites', createFavoritesRouter(container));
  v1Router.use('/reviews', createReviewsRouter(container));
  v1Router.use('/references', createReferencesRouter());
  v1Router.use('/verified-contacts', createVerifiedContactsRouter(container));
  v1Router.use('/channel-publishing', createChannelPublishingRouter(container));
  v1Router.use('/bot-integration', createBotIntegrationRouter(container));
  v1Router.use('/uploads', createUploadsRouter(container));
  v1Router.use('/applications', createApplicationsRouter(container));
  v1Router.use('/saved-searches', createSavedSearchesRouter(container));
  v1Router.use('/notifications', createNotificationsRouter(container));
  v1Router.use('/promotions', createPromotionsRouter(container));
  v1Router.use('/ad-analytics', createAdAnalyticsRouter(container));
  v1Router.use('/ad-reports', createAdReportsRouter(container));
  v1Router.use('/reports', createReservedFeatureRouter('REPORTS_ENABLED', 'reports'));
  v1Router.use('/public-profiles', createReservedFeatureRouter('PUBLIC_PROFILES_ENABLED', 'public-profiles'));
  v1Router.use('/resume-contact-purchases', createResumeContactPurchasesRouter(container));
  v1Router.use('/telegram-sync', createTelegramSyncRouter(container));
  v1Router.use('/finance', createPaymentsRouter(container));

  rootRouter.use('/api/v1', v1Router);
  rootRouter.use('/api', v1Router);

  return rootRouter;
}
