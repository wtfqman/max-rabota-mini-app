import { Router } from 'express';
import type { ApiContainer } from '../../app/container.js';
import { requireAuth, requireRole } from '../../middlewares/auth.middleware.js';
import { requireFeature } from '../../shared/feature-flags/feature-guard.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { adminFinanceQuerySchema, paymentHistoryQuerySchema } from './payment-history.schemas.js';
import { PaymentHistoryService } from './payment-history.service.js';
import { PaymentsController } from './payments.controller.js';

export function createYooKassaWebhookRouter(container: ApiContainer): Router {
  const router = Router();
  const controller = new PaymentsController(container.adPaymentService);

  router.post('/', controller.yookassaWebhook);

  return router;
}

export function createPaymentsRouter(container: ApiContainer): Router {
  const router = Router();
  const paymentHistoryService = new PaymentHistoryService(container.db);
  const controller = new PaymentsController(container.adPaymentService, paymentHistoryService);

  router.get('/history', requireAuth, validateRequest({ query: paymentHistoryQuerySchema }), controller.history);
  router.get(
    '/admin/finance',
    requireFeature('FINANCE_DASHBOARD_ENABLED'),
    requireAuth,
    requireRole(['admin']),
    validateRequest({ query: adminFinanceQuerySchema }),
    controller.adminDashboard
  );
  router.get(
    '/admin/finance.csv',
    requireFeature('FINANCE_DASHBOARD_ENABLED'),
    requireAuth,
    requireRole(['admin']),
    validateRequest({ query: adminFinanceQuerySchema }),
    controller.adminCsv
  );

  return router;
}
