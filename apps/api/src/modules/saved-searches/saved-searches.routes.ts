import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireFeature } from '../../shared/feature-flags/feature-guard.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { SavedSearchesController } from './saved-searches.controller.js';
import {
  createSavedSearchSchema,
  savedSearchIdParamSchema,
  savedSearchListQuerySchema,
  savedSearchResultsQuerySchema,
  updateSavedSearchSchema
} from './saved-searches.schemas.js';

export function createSavedSearchesRouter(container: ApiContainer): Router {
  const router = Router();
  const controller = new SavedSearchesController(container.savedSearchesService);

  router.use(requireFeature('SAVED_SEARCHES_ENABLED'));
  router.use(requireAuth);

  router.get('/', validateRequest({ query: savedSearchListQuerySchema }), controller.list);
  router.post('/', validateRequest({ body: createSavedSearchSchema }), controller.create);
  router.get(
    '/:savedSearchId/results',
    validateRequest({ params: savedSearchIdParamSchema, query: savedSearchResultsQuerySchema }),
    controller.results
  );
  router.patch(
    '/:savedSearchId',
    validateRequest({ params: savedSearchIdParamSchema, body: updateSavedSearchSchema }),
    controller.update
  );
  router.delete('/:savedSearchId', validateRequest({ params: savedSearchIdParamSchema }), controller.delete);

  return router;
}
