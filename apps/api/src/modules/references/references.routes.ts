import { Router } from 'express';
import { validateRequest } from '../../shared/http/validate-request.js';
import { ReferencesController } from './references.controller.js';
import { ReferencesRepository } from './references.repository.js';
import { referenceSuggestQuerySchema } from './references.schemas.js';
import { ReferencesService } from './references.service.js';

export function createReferencesRouter(): Router {
  const router = Router();
  const repository = new ReferencesRepository();
  const service = new ReferencesService(repository);
  const controller = new ReferencesController(service);

  router.get('/status', controller.status);
  router.get('/categories', validateRequest({ query: referenceSuggestQuerySchema }), controller.categories);
  router.get('/districts', validateRequest({ query: referenceSuggestQuerySchema }), controller.districts);

  return router;
}
