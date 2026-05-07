import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { FavoritesController } from './favorites.controller.js';
import { FavoritesRepository } from './favorites.repository.js';
import { favoriteAdParamSchema } from './favorites.schemas.js';
import { FavoritesService } from './favorites.service.js';

export function createFavoritesRouter(container: ApiContainer): Router {
  const router = Router();
  const repository = new FavoritesRepository(container.db);
  const service = new FavoritesService(repository, container.favoriteRepository);
  const controller = new FavoritesController(service);

  router.get('/status', controller.status);
  router.get('/', requireAuth, controller.list);
  router.post('/:adId', requireAuth, validateRequest({ params: favoriteAdParamSchema }), controller.add);
  router.delete('/:adId', requireAuth, validateRequest({ params: favoriteAdParamSchema }), controller.remove);

  return router;
}
